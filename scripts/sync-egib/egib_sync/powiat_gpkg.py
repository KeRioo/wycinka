"""Canonicalization of Export powiatowy GPKG (eziudp_wfs/GPKG) to the loader schema.

Source GPKG (opendata.geoportal.gov.pl ``InneDane/latest_exports/eziudp_wfs/GPKG/<teryt>.gpkg``)
ships layer ``dzialki`` with columns:

    fid, geometry, id_dzialki, numer_dzialki, nazwa_obrebu, numer_obrebu,
    numer_jednostki, nazwa_gminy, data, pole_ewidencyjne, klasouzytki_egib,
    grupa_rejestrowa, pozostale_atrybuty, czas_pozyskania

Repository loader (egib_sync.sqlite_loader) requires:

    id, teryt, number, voivodeship, voivodeship_code, county, county_code,
    commune, commune_code, region, region_name, area_m2, land_use, geometry

Usage::

    python -m egib_sync.powiat_gpkg <in.gpkg> <out.gpkg>
"""

from __future__ import annotations

import argparse
import re
from math import isfinite
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely.geometry.base import BaseGeometry

from egib_sync.logging import get_logger

logger = get_logger(__name__)


def entry_finite(value: int | float) -> bool:
    """True when value is a finite number (rejects NaN/inf)."""
    return bool(isfinite(float(value)))

POW_VOIVODESHIP_CODES: dict[str, str] = {
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

COUNTY_LEGAL_SUFFIXES: dict[str, str] = {
    "1": "",
    "2": " (miasto na prawach powiatu)",
    "3": " (zwartotorowe)",
    "4": " (ziemski)",
    "5": " (morski)",
}


class PowiatGpkgError(RuntimeError):
    """Raised when the input GPKG does not match the expected layout."""


def parse_teryt_units(id_dzialki: str) -> tuple[str, str, str, str, str]:
    """Split ``141701_1.0022.2/2`` into (voiv, county, commune, region, number).

    Returns empty strings when the identifier does not follow TERYT layout.
    """
    match = re.fullmatch(r"(\d{2})(\d{2})(\d{2})_([1-5])\.(\d{4})\.(\S+)", id_dzialki)
    if not match:
        return "", "", "", "", ""
    voiv, county_raw, commune_raw, _, region, number = match.groups()
    county = county_raw + COUNTY_LEGAL_SUFFIXES.get(county_raw[0], "")
    return voiv, county, commune_raw, region, number


def canonicalize_powiat_gdf(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Map the export columns onto the canonical loader schema."""
    required = ("id_dzialki", "geometry")
    missing = [c for c in required if c not in gdf.columns]
    if missing:
        raise PowiatGpkgError(f"GPKG missing required columns: {missing}")

    records: list[dict[str, Any]] = []
    for row in gdf.itertuples(index=False):
        id_dzialki = str(row.id_dzialki)
        voiv, county, commune_code, region, number = parse_teryt_units(id_dzialki)
        if not voiv:
            logger.warning("teryt_parse_failed", id_dzialki=id_dzialki)
            continue
        area_env = getattr(row, "pole_ewidencyjne", None)
        if isinstance(area_env, (int, float)) and entry_finite(area_env):
            area_m2 = float(area_env)
        else:
            area_m2 = 0.0
        land_use = getattr(row, "klasouzytki_egib", None)
        records.append(
            {
                "id": id_dzialki,
                "teryt": id_dzialki,
                "number": number,
                "voivodeship": POW_VOIVODESHIP_CODES.get(voiv, ""),
                "voivodeship_code": voiv,
                "county": county,
                "county_code": voiv + county[:2],
                "commune": str(getattr(row, "nazwa_gminy", "") or ""),
                "commune_code": str(getattr(row, "numer_jednostki", "")),
                "region": region,
                "region_name": str(getattr(row, "nazwa_obrebu", "") or ""),
                "area_m2": area_m2,
                "land_use": "Inne" if not isinstance(land_use, str) or not land_use.strip() else land_use,
                "geometry": row.geometry,
            }
        )

    if not records:
        raise PowiatGpkgError("no features survived TERYT parsing")

    out = gpd.GeoDataFrame(records, geometry="geometry")

    for column in ("voivodeship_code", "county_code", "commune_code", "region"):
        out[column] = out[column].astype(str)
    return out


def canonicalize_powiat_gpkg(
    source: Path,
    target: Path,
    *,
    layer: str = "dzialki",
    source_crs: str = "EPSG:2180",
) -> gpd.GeoDataFrame:
    """Read <source> (layer <layer>), canonicalize, reproject to WGS84, write <target>."""
    gdf = gpd.read_file(str(source), layer=layer)
    if gdf.crs is None:
        gdf = gdf.set_crs(source_crs)
    canonical = canonicalize_powiat_gdf(gdf)
    if canonical.crs is None:
        canonical = canonical.set_crs(gdf.crs or source_crs)
    if canonical.crs.to_epsg() != 4326:
        canonical = canonical.to_crs("EPSG:4326")
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = target.with_name(target.stem + ".tmp.gpkg")
    canonical.to_file(str(staging), layer=layer, driver="GPKG")
    staging.replace(target)
    logger.info("powiat_gpkg_canonicalized", source=str(source), target=str(target), rows=len(canonical))
    return canonical


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("--layer", default="dzialki")
    args = parser.parse_args(argv)
    try:
        gdf = canonicalize_powiat_gpkg(args.source, args.target, layer=args.layer)
    except PowiatGpkgError as exc:
        print(f"error: {exc}")
        return 1
    print(f"canonicalized: {len(gdf)} features -> {args.target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
