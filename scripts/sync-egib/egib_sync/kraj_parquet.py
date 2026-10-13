"""Streaming reader + canonicalizer for the national EGiB GeoParquet export.

Source (opendata.geoportal.gov.pl ``InneDane/latest_exports/eziudp_wfs/PARQUET``):

- ``0_dzialki.parquet`` — whole country (~38.8 m rows, ~5.5 GB),
- ``{voiv}_dzialki.parquet`` — single voivodeship (e.g. ``14_dzialki.parquet``).

GeoParquet v1.1: column ``geometry`` holds WKB in EPSG:2180 (ETRF2000-PL /
CS92); the attribute columns are identical to the powiat GPKG export
(``powiat_gpkg.py``), so canonicalization reuses the same TERYT parsing and
voivodeship code mapping. Records are streamed row-group by row-group as
canonical loader dicts (WGS84 shapely geometries) — the whole country must
never be materialized in memory.

Usage::

    python -m egib_sync.kraj_parquet download [URL] [TARGET]
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Final

import httpx
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from pyproj import Transformer
from shapely import from_wkb
from shapely import transform as shapely_transform
from shapely.geometry.base import BaseGeometry

from egib_sync.logging import get_logger
from egib_sync.powiat_gpkg import POW_VOIVODESHIP_CODES, parse_teryt_units

logger = get_logger(__name__)

KRAJ_PARQUET_URL: Final[str] = (
    "https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/0_dzialki.parquet"
)
KRAJ_PARQUET_VOIV_TEMPLATE: Final[str] = (
    "https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/{voiv}_dzialki.parquet"
)
KRAJ_PARQUET_FILENAME: Final[str] = "0_dzialki.parquet"
KRAJ_DATASOURCE: Final[str] = "geoportal-parquet-kraj"
KRAJ_SOURCE_CRS: Final[int] = 2180

REQUIRED_COLUMNS: Final[tuple[str, ...]] = ("id_dzialki", "geometry")
ATTRIBUTE_COLUMNS: Final[tuple[str, ...]] = (
    "numer_dzialki",
    "numer_obrebu",
    "numer_jednostki",
    "nazwa_gminy",
    "pole_ewidencyjne",
    "klasouzytki_egib",
)


class KrajParquetError(RuntimeError):
    """Raised when the kraj parquet is missing, invalid or unusable."""


@dataclass(frozen=True, slots=True)
class KrajReadStats:
    """Aggregated counters for one pass over a kraj parquet file."""

    row_groups: int = 0
    rows: int = 0
    kept: int = 0
    skipped_teryt: int = 0
    skipped_geometry: int = 0


def make_transformer() -> Transformer:
    """EPSG:2180 -> EPSG:4326 transformer (always_xy: lng/lat order)."""
    return Transformer.from_crs(2180, 4326, always_xy=True)


def validate_schema(table: pa.Table) -> None:
    """Raise :class:`KrajParquetError` when required columns are missing."""
    missing = [c for c in REQUIRED_COLUMNS + ATTRIBUTE_COLUMNS if c not in table.column_names]
    if missing:
        raise KrajParquetError(f"kraj parquet missing columns: {missing}")


def _transform_callback(
    transformer: Transformer,
) -> Any:
    """Wrap a pyproj transformer into the shapely.transform callback shape."""

    def _apply(coords: np.ndarray) -> np.ndarray:
        out = np.empty_like(coords)
        out[:, 0], out[:, 1] = transformer.transform(coords[:, 0], coords[:, 1])
        return out

    return _apply


def reproject_to_wgs84(
    geoms: list[BaseGeometry | None],
    transformer: Transformer | None = None,
) -> list[BaseGeometry | None]:
    """Reproject EPSG:2180 geometries to EPSG:4326 (vectorized, None-safe)."""
    tf = transformer if transformer is not None else make_transformer()
    usable = [i for i, geom in enumerate(geoms) if geom is not None and not geom.is_empty]
    if not usable:
        return list(geoms)
    transformed = shapely_transform(
        np.asarray([geoms[i] for i in usable], dtype=object),
        _transform_callback(tf),
    )
    by_index = dict(zip(usable, transformed, strict=True))
    return [by_index.get(i) for i in range(len(geoms))]


def _area_to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    area = float(value)
    return area if np.isfinite(area) else 0.0


def _land_use(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "Inne"
    return value


def canonicalize_row(row: Mapping[str, Any], geom_wgs84: BaseGeometry) -> dict[str, Any] | None:
    """Canonicalize one kraj parquet row to the loader schema.

    Returns ``None`` when the TERYT id does not match ``WWPPGG_R.OOOO.NR``.
    """
    id_dzialki = str(row.get("id_dzialki") or "")
    voiv, county, commune_code, region, number = parse_teryt_units(id_dzialki)
    if not voiv:
        return None
    numer_dzialki = row.get("numer_dzialki")
    numer_obrebu = row.get("numer_obrebu")
    return {
        "id": id_dzialki,
        "teryt": id_dzialki,
        "number": str(numer_dzialki) if numer_dzialki else number,
        "voivodeship": POW_VOIVODESHIP_CODES.get(voiv, ""),
        "voivodeship_code": voiv,
        "county": county,
        "county_code": voiv + county[:2],
        "commune": str(row.get("nazwa_gminy") or ""),
        "commune_code": str(row.get("numer_jednostki") or ""),
        "region": str(numer_obrebu) if numer_obrebu else region,
        "region_name": str(row.get("nazwa_obrebu") or ""),
        "area_m2": _area_to_float(row.get("pole_ewidencyjne")),
        "land_use": _land_use(row.get("klasouzytki_egib")),
        "geometry": geom_wgs84,
    }


def _table_columns(table: pa.Table) -> dict[str, list[Any]]:
    columns: dict[str, list[Any]] = {}
    for name in table.column_names:
        columns[name] = table.column(name).to_pylist()
    for required in REQUIRED_COLUMNS:
        if required not in columns:
            raise KrajParquetError(f'kraj parquet missing columns: ["{required}"]')
    for optional in ATTRIBUTE_COLUMNS:
        if optional not in columns:
            logger.warning("kraj_column_missing", column=optional)
            columns[optional] = [None] * table.num_rows
    return columns


def canonicalize_table(
    table: pa.Table, transformer: Transformer
) -> tuple[list[dict[str, Any]], KrajReadStats]:
    """Canonicalize a (row-group sized) table batch to WGS84 records."""
    validate_schema(table)
    columns = _table_columns(table)
    wkb_values = columns["geometry"]
    geoms_raw: list[BaseGeometry | None] = from_wkb(np.asarray(wkb_values, dtype=object)).tolist()
    usable = [i for i, geom in enumerate(geoms_raw) if geom is not None and not geom.is_empty]
    if usable:
        transformed = shapely_transform(
            np.asarray([geoms_raw[i] for i in usable], dtype=object),
            _transform_callback(transformer),
        )
        by_index = dict(zip(usable, transformed, strict=True))
    else:
        by_index = {}

    out: list[dict[str, Any]] = []
    skipped_teryt = 0
    skipped_geometry = 0
    for idx, row_id in enumerate(columns["id_dzialki"]):
        if row_id is None:
            skipped_teryt += 1
            continue
        geom = by_index.get(idx)
        if geom is None:
            skipped_geometry += 1
            continue
        record = canonicalize_row(
            {
                "id_dzialki": row_id,
                "numer_dzialki": columns["numer_dzialki"][idx],
                "numer_obrebu": columns["numer_obrebu"][idx],
                "numer_jednostki": columns["numer_jednostki"][idx],
                "nazwa_obrebu": columns.get("nazwa_obrebu", [None] * table.num_rows)[idx],
                "nazwa_gminy": columns["nazwa_gminy"][idx],
                "pole_ewidencyjne": columns["pole_ewidencyjne"][idx],
                "klasouzytki_egib": columns["klasouzytki_egib"][idx],
            },
            geom,
        )
        if record is None:
            skipped_teryt += 1
            continue
        out.append(record)

    stats = KrajReadStats(
        rows=table.num_rows,
        kept=len(out),
        skipped_teryt=skipped_teryt,
        skipped_geometry=skipped_geometry,
    )
    return out, stats


class KrajParquetReader:
    """Streaming, row-group based reader over the kraj GeoParquet export."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        if not self.path.exists():
            raise KrajParquetError(
                f"kraj parquet not found: {self.path}"
                " (download first: python -m egib_sync.kraj_parquet download)"
            )
        self._pf = pq.ParquetFile(self.path)
        self.stats = KrajReadStats()

    @property
    def num_rows(self) -> int:
        return int(self._pf.metadata.num_rows)

    @property
    def num_row_groups(self) -> int:
        return int(self._pf.metadata.num_row_groups)

    def schema(self) -> pa.Schema:
        return self._pf.schema_arrow

    def close(self) -> None:
        self._pf.close()

    def iter_parcels(
        self,
        *,
        batch_rows: int = 50_000,
        max_row_groups: int | None = None,
        max_rows: int | None = None,
        transformer: Transformer | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Yield canonical parcel dicts, reading the file incrementally.

        ``max_row_groups`` / ``max_rows`` restrict the pass (samples & tests).
        ``batch_rows`` bounds the size of one processed table slice.
        """
        if batch_rows <= 0:
            raise ValueError(f"batch_rows must be positive, got {batch_rows}")
        tf = transformer if transformer is not None else make_transformer()
        row_groups = (
            self.num_row_groups
            if max_row_groups is None
            else min(max_row_groups, self.num_row_groups)
        )
        emitted = 0
        for rg in range(row_groups):
            table = self._pf.read_row_group(rg, columns=None)
            for start in range(0, table.num_rows, batch_rows):
                slice_table = table.slice(start, batch_rows)
                records, rg_stats = canonicalize_table(slice_table, tf)
                self.stats = KrajReadStats(
                    row_groups=self.stats.row_groups + 1,
                    rows=self.stats.rows + rg_stats.rows,
                    kept=self.stats.kept + rg_stats.kept,
                    skipped_teryt=self.stats.skipped_teryt + rg_stats.skipped_teryt,
                    skipped_geometry=self.stats.skipped_geometry + rg_stats.skipped_geometry,
                )
                for record in records:
                    emitted += 1
                    if max_rows is not None and emitted > max_rows:  # noqa: SIM108
                        return
                    yield record

    def iter_parcels_shard(
        self,
        shard_index: int,
        total_shards: int,
        *,
        batch_rows: int = 50_000,
        transformer: Transformer | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Yield canonical parcels for one shard of row groups.

        Row groups are distributed modulo-style (``rg % total_shards ==
        shard_index``), so N workers cover the file without overlap and
        without sharing the ParquetFile handle.
        """
        if total_shards <= 0:
            raise ValueError(f"total_shards must be positive, got {total_shards}")
        if not 0 <= shard_index < total_shards:
            raise ValueError(f"shard_index must be in [0, {total_shards - 1}], got {shard_index}")
        if batch_rows <= 0:
            raise ValueError(f"batch_rows must be positive, got {batch_rows}")
        tf = transformer if transformer is not None else make_transformer()
        for rg in range(shard_index, self.num_row_groups, total_shards):
            table = self._pf.read_row_group(rg, columns=None)
            for start in range(0, table.num_rows, batch_rows):
                slice_table = table.slice(start, batch_rows)
                records, rg_stats = canonicalize_table(slice_table, tf)
                self.stats = KrajReadStats(
                    row_groups=self.stats.row_groups + 1,
                    rows=self.stats.rows + rg_stats.rows,
                    kept=self.stats.kept + rg_stats.kept,
                    skipped_teryt=self.stats.skipped_teryt + rg_stats.skipped_teryt,
                    skipped_geometry=self.stats.skipped_geometry + rg_stats.skipped_geometry,
                )
                yield from records


def download_kraj_parquet(
    url: str,
    target: Path,
    *,
    chunk_size: int = 8_388_608,
    timeout: float = 30.0,
    max_retries: int = 3,
    resume: bool = True,
) -> Path:
    """Download ``url`` to ``target`` with HTTP resume support.

    Partial data lives in ``<target>.part``: each retry sends a ``Range``
    request continuing from the current offset. Atomic rename on success.
    """
    part = target.with_suffix(target.suffix + ".part")
    target.parent.mkdir(parents=True, exist_ok=True)
    attempts = max(1, max_retries)
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            offset = part.stat().st_size if resume and part.exists() else 0
            headers: dict[str, str] = {"Range": f"bytes={offset}-"} if offset > 0 else {}
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                with client.stream("GET", url, headers=headers) as response:
                    if response.status_code == 416:
                        part.replace(target)
                        return target
                    response.raise_for_status()
                    if offset > 0 and response.status_code != 206:
                        offset = 0
                    with part.open("ab" if offset > 0 else "wb") as fh:
                        for chunk in response.iter_bytes(chunk_size=chunk_size):
                            fh.write(chunk)
            return _finalize_download(part, target, resume)
        except httpx.HTTPError as exc:
            last_error = exc
            logger.warning("kraj_download_retry", attempt=attempt, error=str(exc))
    raise KrajParquetError(f"failed to download {url} after {attempts} attempts: {last_error!r}")


def _finalize_download(part: Path, target: Path, resume: bool) -> Path:
    if resume and target.exists() and part.exists():
        part.unlink()
        return target
    if part.exists():
        part.replace(target)
    return target


def ensure_kraj_parquet(path: Path, url: str, *, max_retries: int = 3) -> Path:
    """Return ``path``, downloading ``url`` into it first when absent."""
    if path.exists():
        return path
    return download_kraj_parquet(url, path, max_retries=max_retries)


def read_sample_row_group(path: Path | str, row_group: int = 0) -> pa.Table:
    """Materialize one row group (sample tooling, never for full runs)."""
    pf = pq.ParquetFile(path)
    try:
        return pf.read_row_group(row_group)
    finally:
        pf.close()


__all__ = [
    "ATTRIBUTE_COLUMNS",
    "KRAJ_DATASOURCE",
    "KRAJ_PARQUET_FILENAME",
    "KRAJ_PARQUET_URL",
    "KRAJ_PARQUET_VOIV_TEMPLATE",
    "KRAJ_SOURCE_CRS",
    "KrajParquetError",
    "KrajParquetReader",
    "KrajReadStats",
    "REQUIRED_COLUMNS",
    "canonicalize_row",
    "canonicalize_table",
    "download_kraj_parquet",
    "ensure_kraj_parquet",
    "make_transformer",
    "main",
    "read_sample_row_group",
    "reproject_to_wgs84",
    "validate_schema",
]


def main(argv: list[str] | None = None) -> int:
    from egib_sync.logging import configure_logging

    parser = argparse.ArgumentParser(prog="egib-kraj-parquet", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    dl = sub.add_parser("download", help="download the kraj GeoParquet export")
    dl.add_argument("target", type=Path, help="destination .parquet path")
    dl.add_argument("--url", default=KRAJ_PARQUET_URL, help="override source URL")
    dl.add_argument("--voiv", help="single voivodeship code (e.g. 14 -> 14_dzialki.parquet)")
    args = parser.parse_args(argv)
    configure_logging("INFO", json_output=False)
    url = KRAJ_PARQUET_VOIV_TEMPLATE.format(voiv=args.voiv) if args.voiv else args.url
    download_kraj_parquet(url, args.target)
    print(f"downloaded: {url} -> {args.target}")
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1:]))
