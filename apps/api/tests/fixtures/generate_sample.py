"""Generate a small SQLite fixture used by the backend test suite.

Run from ``apps/api/``:

    .venv/Scripts/python.exe tests/fixtures/generate_sample.py

Produces ``tests/fixtures/parcels_sample.sqlite`` with 10 realistic
działki from the Warsaw 0001 obręb (TERYT ``141201_1.0001.6501`` ...
``141201_1.0001.6510``). Geometries are CCW 100m x 100m squares
(roughly 1 ha) scattered around ``21.0122`` / ``52.2297``.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "parcels_sample.sqlite"

VOIVODESHIP = "mazowieckie"
VOIVODESHIP_CODE = "14"
COUNTY = "Warszawa"
COUNTY_CODE = "1201"
COMMUNE = "Śródmieście"
COMMUNE_CODE = "141201"
REGION = "0001"
REGION_NAME = "Obręb 0001"
FETCHED_AT = "2026-09-29T03:00:00Z"
DATASOURCE = "geoportal.gov.pl"


def _square(center_lat: float, center_lng: float, side_deg: float) -> str:
    half = side_deg / 2.0
    coords = [
        (center_lng - half, center_lat - half),
        (center_lng + half, center_lat - half),
        (center_lng + half, center_lat + half),
        (center_lng - half, center_lat + half),
        (center_lng - half, center_lat - half),
    ]
    return "POLYGON ((" + ", ".join(f"{lng} {lat}" for lng, lat in coords) + "))"


PARCELS: list[dict[str, object]] = [
    {
        "id": f"141201_1.0001.{6501 + i}",
        "teryt": f"141201_1.0001.{6501 + i}",
        "number": str(6501 + i),
        "land_use": "Ls" if i % 3 == 0 else ("Lz" if i % 3 == 1 else "R"),
        "centroid": (21.0060 + 0.0010 * i, 52.2290 + 0.0008 * i),
        "side": 0.0010,
    }
    for i in range(10)
]


def main() -> int:
    OUT.unlink(missing_ok=True)
    conn = sqlite3.connect(OUT)
    conn.row_factory = sqlite3.Row
    try:
        from app.core.db import (
            ALL_SCHEMA,
        )
    except ImportError:
        sys.path.insert(0, str(ROOT.parent.parent))
        from app.core.db import ALL_SCHEMA

    conn.executescript(ALL_SCHEMA)
    conn.execute(
        "INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)",
        ("last_sync", FETCHED_AT, FETCHED_AT),
    )
    conn.execute(
        "INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)",
        ("parcels_count", str(len(PARCELS)), FETCHED_AT),
    )

    for parcel in PARCELS:
        lng = float(parcel["centroid"][0])
        lat = float(parcel["centroid"][1])
        side = float(parcel["side"])
        half = side / 2.0
        wkt = _square(lat, lng, side)
        conn.execute(
            """
            INSERT INTO parcels (
              id, teryt, number, voivodeship, voivodeship_code,
              county, county_code, commune, commune_code,
              region, region_name, area_m2, land_use, geom_wkt,
              centroid_lng, centroid_lat, bbox_min_lng, bbox_min_lat,
              bbox_max_lng, bbox_max_lat, fetched_at, datasource
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                parcel["id"],
                parcel["teryt"],
                parcel["number"],
                VOIVODESHIP,
                VOIVODESHIP_CODE,
                COUNTY,
                COUNTY_CODE,
                COMMUNE,
                COMMUNE_CODE,
                REGION,
                REGION_NAME,
                10000.0,
                parcel["land_use"],
                wkt,
                lng,
                lat,
                lng - half,
                lat - half,
                lng + half,
                lat + half,
                FETCHED_AT,
                DATASOURCE,
            ),
        )

    conn.commit()
    conn.close()
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
