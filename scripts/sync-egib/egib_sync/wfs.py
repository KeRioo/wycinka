"""GUGiK zbiorcza WFS downloader for EGiB parcels.

Downloads cadastral parcels (``ms:dzialki`` layer) for a single powiat from the
collective GUGiK WFS service (PZGIK/EGIB/UslugaZbiorcza), pages through the
result set with WFS 2.0 ``STARTINDEX``, converts EPSG:2180 GML pages to a
canonical WGS 84 GeoPackage schema shared with the rest of the pipeline.

Service: https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza
"""

from __future__ import annotations

import asyncio
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import geopandas as gpd
import httpx
import pandas as pd
import pyogrio
from pyproj import CRS

from egib_sync.config import DownloadSettings
from egib_sync.logging import get_logger
from egib_sync.retry import RetryError, retry

logger = get_logger(__name__)

WFS_URL_DEFAULT: str = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza"
WFS_LAYER_DEFAULT: str = "ms:dzialki"

SOURCE_CRS: CRS = CRS.from_user_input("EPSG:2180")
TARGET_CRS: CRS = CRS.from_user_input("EPSG:4326")


class WfsDownloadError(RuntimeError):
    """Raised when the WFS download of a powiat fails."""


class DiskBudgetExceededError(WfsDownloadError):
    """Raised when the raw download would exceed the configured disk budget."""


@dataclass(frozen=True, slots=True)
class WfsPowiatResult:
    """Outcome of a single-powiat WFS download."""

    teryt: str
    name: str
    path: Path
    parcels: int
    pages: int
    hits: int
    success: bool
    error: str | None = None


def load_powiat_names(path: Path | None = None) -> dict[str, str]:
    """Return the bundled TERYT(4) -> powiat name registry (380 entries)."""
    from egib_sync.powiats import POWIATS

    if path is not None:
        import csv

        with open(path, encoding="utf-8") as f:
            return {row["teryt"].strip(): row["name"].strip() for row in csv.DictReader(f)}
    return dict(POWIATS)


def resolve_powiat_name(teryt: str, mapping: dict[str, str] | None = None) -> str:
    """Resolve a powiat name for a TERYT prefix, falling back to the raw code."""
    prefix = teryt[:4]
    if mapping is None:
        mapping = load_powiat_names()
    return mapping.get(prefix, f"powiat {prefix}")


def build_getfeature_params(
    *,
    layer: str,
    teryt_prefix: str,
    startindex: int = 0,
    count: int | None = None,
    hits: bool = False,
) -> dict[str, str]:
    """Build WFS 2.0 GetFeature query parameters for a powiat TERYT prefix."""
    params: dict[str, str] = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": layer,
    }
    if hits:
        params["resultType"] = "hits"
    if count is not None:
        params["count"] = str(count)
    if startindex > 0:
        params["STARTINDEX"] = str(startindex)
    if teryt_prefix:
        params["FILTER"] = (
            '<Filter><PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\">'
            "<PropertyName>ms:ID_DZIALKI</PropertyName>"
            f"<Literal>{teryt_prefix}%</Literal>"
            "</PropertyIsLike></Filter>"
        )
    return params


def format_url(base_url: str, params: dict[str, str]) -> str:
    """Join base URL and query params, percent-encoding (spaces as %20, not +).

    The MapServer-based GUGiK WFS rejects a form-style ``+`` used to encode
    space characters inside the OGC XML ``FILTER`` parameter.
    """
    import urllib.parse

    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{query}"


@retry(max_attempts=6, base_delay=5.0, max_delay=120.0, exceptions=(httpx.HTTPError,))
async def fetch_page_async(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, str],
) -> bytes:
    """GET a WFS GetFeature page with exponential backoff retries."""
    response = await client.get(format_url(url, params))
    response.raise_for_status()
    return response.content


@retry(max_attempts=6, base_delay=5.0, max_delay=120.0, exceptions=(httpx.HTTPError,))
async def count_parcels_async(
    client: httpx.AsyncClient,
    url: str,
    params: dict[str, str],
) -> int:
    """Count matched features via ``resultType=hits`` (server-side)."""
    response = await client.get(format_url(url, params))
    response.raise_for_status()
    return parse_number_matched(response.content)


def parse_number_matched(content: bytes) -> int:
    """Extract ``numberMatched`` from a WFS hits FeatureCollection."""
    import re

    match = re.search(rb'numberMatched="(\d+)"', content)
    if not match:
        raise WfsDownloadError("WFS hits response missing numberMatched attribute")
    return int(match.group(1))


def write_gml_page(content: bytes, directory: Path, index: int) -> Path:
    """Persist a raw GML page under ``directory`` with a ``.gml`` extension."""
    path = directory / f"page_{index:05d}.gml"
    with open(path, "wb") as f:
        f.write(content)
    return path


def read_gml_page(path: Path) -> gpd.GeoDataFrame:
    """Read a persisted GML page through GDAL/OGR into a GeoDataFrame."""
    return gpd.read_file(str(path))


_CANONICAL_COLUMNS: tuple[str, ...] = (
    "id",
    "teryt",
    "number",
    "voivodeship",
    "voivodeship_code",
    "county",
    "county_code",
    "commune",
    "commune_code",
    "region",
    "region_name",
    "area_m2",
    "land_use",
)


def parse_area_m2(value: Any) -> float:
    """Parse ``POLE_EWIDENYJNE`` (square meters, possibly empty or invalid)."""
    if value is None:
        return 0.0
    try:
        return float(str(value).replace(",", ".").strip())
    except (ValueError, TypeError):
        return 0.0


def parse_obreb(value: Any) -> str:
    """Normalize the obręb number to the 4-digit canonical form."""
    text = str(value or "").strip()
    if not text:
        return ""
    if text.isalnum() and not text.isalpha():
        return text.zfill(4)
    return text


def canonicalize_page(
    gdf: gpd.GeoDataFrame,
    *,
    powiat_teryt: str,
    powiat_name: str,
    voivodeship_name: str,
) -> gpd.GeoDataFrame:
    """Map raw WFS attributes to the canonical EGiB schema and reproject to WGS 84.

    Optional EGiB fields (``POLE_EWIDENYJNE``, ``KLASOUZYTKI_EGIB``,
    ``GRUPA_REJESTROWA``) may be omitted by the server for empty features —
    treat them as empty strings rather than schema regressions.
    """
    columns = set(gdf.columns)
    if "ID_DZIALKI" not in columns or "geometry" not in columns:
        raise WfsSchemaError("GML page missing required columns: ID_DZIALKI and/or geometry")

    def column(name: str) -> pd.Series[str]:
        if name in columns:
            return gdf[name].fillna("").astype(str)
        return pd.Series([""] * len(gdf), index=gdf.index)

    voiv_code = powiat_teryt[:2]
    county_code = powiat_teryt[:4]

    try:
        crs = CRS.from_user_input(gdf.crs) if gdf.crs is not None else SOURCE_CRS
    except Exception:  # noqa: BLE001
        crs = SOURCE_CRS
    crs_is_2180 = crs == SOURCE_CRS

    areas: list[float] = []
    pole_values = gdf["POLE_EWIDENYJNE"] if "POLE_EWIDENYJNE" in columns else None
    for row_idx, geom in enumerate(gdf.geometry):
        parsed = parse_area_m2(pole_values.iloc[row_idx]) if pole_values is not None else 0.0
        if parsed <= 0.0 and geom is not None and not geom.is_empty and crs_is_2180:
            parsed = float(geom.area)
        areas.append(parsed)

    land_use = [
        lu if lu else gr
        for lu, gr in zip(column("KLASOUZYTKI_EGIB"), column("GRUPA_REJESTROWA"), strict=True)
    ]

    data = pd.DataFrame(
        {
            "id": gdf["ID_DZIALKI"].astype(str),
            "teryt": gdf["ID_DZIALKI"].astype(str),
            "number": column("NUMER_DZIALKI").astype(str),
            "voivodeship": voivodeship_name,
            "voivodeship_code": voiv_code,
            "county": powiat_name,
            "county_code": county_code,
            "commune": column("NAZWA_GMINY"),
            "commune_code": column("NUMER_JEDNOSTKI"),
            "region": [parse_obreb(v) for v in column("NUMER_OBREBU")],
            "region_name": column("NAZWA_OBREBU"),
            "area_m2": areas,
            "land_use": land_use,
        }
    )

    reprojected = gdf.to_crs(TARGET_CRS) if crs != TARGET_CRS else gdf
    data = data.fillna("")
    return gpd.GeoDataFrame(data, geometry=reprojected.geometry.values, crs=TARGET_CRS)


class WfsSchemaError(ValueError):
    """Raised when the GML page schema does not match the expected EGiB attributes."""


def init_gpkg(gdf: gpd.GeoDataFrame, path: Path) -> None:
    """Create the GPKG with the first page of features (header geometry)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pyogrio.write_dataframe(gdf, str(path), layer="dzialki", driver="GPKG", append=False)


def append_gpkg(gdf: gpd.GeoDataFrame, path: Path) -> None:
    """Append a page of features to an existing GPKG."""
    pyogrio.write_dataframe(gdf, str(path), layer="dzialki", driver="GPKG", append=True)


async def download_powiat_wfs(
    teryt: str,
    output_dir: Path,
    *,
    name: str | None = None,
    settings: DownloadSettings | None = None,
    wfs_url: str = WFS_URL_DEFAULT,
    wfs_layer: str = WFS_LAYER_DEFAULT,
    page_size: int | None = None,
    max_parcels: int | None = None,
    max_result_bytes: int | None = None,
    progress_every: int = 5,
) -> WfsPowiatResult:
    """Download all parcels for a single powiat from the zbiorcza WFS into a GPKG.

    Pages through the GetFeature result set (STARTINDEX), parses each GML page,
    reprojects to EPSG:4326, maps attributes to the canonical schema and appends
    to ``{output_dir}/{teryt}.gpkg``. Write target is created from a fresh temp
    file and renamed atomically on success.

    Args:
        teryt: Powiat TERYT prefix (4 digits) or longer ID_DZIALKI prefix filter.
        output_dir: Destination directory for ``{teryt}.gpkg``.
        name: Powiat display name (resolved from the bundled registry if None).
        settings: Download settings (client limits are derived from httpx client config in callers).
        wfs_url: Base URL of the WFS service.
        wfs_layer: Layer name (typenames).
        page_size: Number of features per GetFeature request.
        max_parcels: Optional cap of downloaded parcels (test hook).
        max_result_bytes: Optional cap of raw GML bytes fetched (disk guard).
        progress_every: Log every N pages.

    Returns:
        :class:`WfsPowiatResult` (``success=False`` on errors).
    """
    settings = settings or DownloadSettings()
    resolved_name = name or resolve_powiat_name(teryt)
    out_path = output_dir / f"{teryt}.gpkg"
    output_dir.mkdir(parents=True, exist_ok=True)

    page_size = page_size or settings.page_size
    max_result_bytes = (
        max_result_bytes if max_result_bytes is not None else settings.max_result_bytes
    )
    seen_ids: set[str] = set()
    tmp_path = output_dir / f".{teryt}.tmp" / f"{teryt}.gpkg"
    started_note = {"pages": 0, "succ_par": 0, "succ_bytes": 0}
    header_written = False
    with tempfile.TemporaryDirectory(prefix="egib_wfs-") as tmp_dir:
        tmp_dir_path = Path(tmp_dir)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                hits_params = build_getfeature_params(
                    layer=wfs_layer, teryt_prefix=teryt, hits=True
                )
                try:
                    total = await count_parcels_async(client, wfs_url, hits_params)
                except RetryError as exc:
                    logger.warning("wfs_hits_count_unavailable", teryt=teryt, error=str(exc))
                    total = -1
                started_note["hits"] = total

                logger.info("wfs_hits_counted", teryt=teryt, hits=total, url=wfs_url)
                if (
                    total >= 0
                    and max_result_bytes is not None
                    and total * 10_000 > max_result_bytes
                ):
                    raise DiskBudgetExceededError(
                        f"powiat {teryt} ({total} parcels) likely exceeds raw budget "
                        f"{max_result_bytes} bytes"
                    )

                loop = asyncio.get_running_loop()
                index = 0
                startindex = 0
                while True:
                    params = build_getfeature_params(
                        layer=wfs_layer,
                        teryt_prefix=teryt,
                        startindex=startindex,
                        count=page_size,
                    )
                    try:
                        content = await fetch_page_async(client, wfs_url, params)
                    except RetryError as exc:
                        raise WfsDownloadError(
                            f"page {index} failed for {teryt}: {exc.last_exception}"
                        ) from exc

                    started_note["succ_bytes"] += len(content)
                    if (
                        max_result_bytes is not None
                        and started_note["succ_bytes"] > max_result_bytes
                    ):
                        raise DiskBudgetExceededError(
                            f"raw bytes {started_note['succ_bytes']} exceed budget {max_result_bytes}"
                        )

                    gml_path = write_gml_page(content, tmp_dir_path, index)
                    if b"<wfs:member>" not in content:
                        gml_path.unlink()
                        break
                    gdf = await loop.run_in_executor(None, read_gml_page, gml_path)
                    gml_path.unlink()

                    if gdf.empty:
                        break
                    if seen_ids is not None:
                        ids = gdf["ID_DZIALKI"].astype(str) if "ID_DZIALKI" in gdf else None
                        if ids is not None:
                            gdf = gdf[~ids.isin(seen_ids)]
                            seen_ids.update(ids.tolist())
                    if len(gdf) == 0:
                        startindex += page_size
                        continue
                    canonical = canonicalize_page(
                        gdf,
                        powiat_teryt=teryt,
                        powiat_name=resolved_name,
                        voivodeship_name=_voivodeship_name(teryt),
                    )
                    if not header_written:
                        init_gpkg(canonical, tmp_path)
                        header_written = True
                    else:
                        await loop.run_in_executor(None, append_gpkg, canonical, tmp_path)
                    index += 1
                    started_note["pages"] = index
                    started_note["succ_par"] += len(canonical)
                    if index % progress_every == 0:
                        logger.info(
                            "wfs_page_progress",
                            teryt=teryt,
                            pages=index,
                            parcels=started_note["succ_par"],
                            hits=total,
                        )
                    if max_parcels is not None and started_note["succ_par"] >= max_parcels:
                        break
                    startindex += page_size

            if not header_written:
                raise WfsDownloadError(f"WFS returned no features for {teryt}")
            tmp_path.replace(out_path)
            logger.info(
                "wfs_download_ok",
                teryt=teryt,
                path=str(out_path),
                parcels=started_note["succ_par"],
                pages=started_note["pages"],
                hits=total,
                gml_bytes=started_note["succ_bytes"],
                gpkg_bytes=out_path.stat().st_size,
            )
            return WfsPowiatResult(
                teryt=teryt,
                name=resolved_name,
                path=out_path,
                parcels=started_note["succ_par"],
                pages=started_note["pages"],
                hits=total,
                success=True,
            )
        except Exception as exc:  # noqa: BLE001
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
            logger.error(
                "wfs_download_failed",
                teryt=teryt,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            return WfsPowiatResult(
                teryt=teryt,
                name=resolved_name,
                path=out_path,
                parcels=started_note["succ_par"],
                pages=started_note["pages"],
                hits=started_note.get("hits", 0),
                success=False,
                error=f"{type(exc).__name__}: {exc}",
            )


_VOIVODESHIPS: dict[str, str] = {
    "02": "dolnośląskie",
    "04": "kujawsko-pomorskie",
    "06": "lubelskie",
    "08": "lubuskie",
    "10": "łódzkie",
    "12": "małopolskie",
    "14": "mazowieckie",
    "16": "opolskie",
    "18": "podkarpackie",
    "20": "podlaskie",
    "22": "pomorskie",
    "24": "śląskie",
    "26": "świętokrzyskie",
    "28": "warmińsko-mazurskie",
    "30": "wielkopolskie",
    "32": "zachodniopomorskie",
}


def _voivodeship_name(teryt: str) -> str:
    return _VOIVODESHIPS.get(teryt[:2], "")


__all__ = [
    "DiskBudgetExceededError",
    "WfsDownloadError",
    "WfsPowiatResult",
    "WfsSchemaError",
    "WFS_LAYER_DEFAULT",
    "WFS_URL_DEFAULT",
    "append_gpkg",
    "build_getfeature_params",
    "canonicalize_page",
    "count_parcels_async",
    "download_powiat_wfs",
    "init_gpkg",
    "load_powiat_names",
    "parse_area_m2",
    "parse_number_matched",
    "parse_obreb",
    "read_gml_page",
    "resolve_powiat_name",
    "write_gml_page",
]
