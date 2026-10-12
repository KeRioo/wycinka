"""Test data builders for the kraj GeoParquet pipeline (synthetic EPSG:2180 rows)."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from shapely import from_wkb, to_wkb
from shapely.geometry import Polygon

KRAJ_SCHEMA_FIELDS: list[tuple[str, pa.DataType]] = [
    ("id_dzialki", pa.string()),
    ("numer_dzialki", pa.string()),
    ("nazwa_obrebu", pa.string()),
    ("numer_obrebu", pa.string()),
    ("numer_jednostki", pa.string()),
    ("nazwa_gminy", pa.string()),
    ("data", pa.string()),
    ("pole_ewidencyjne", pa.decimal128(12, 4)),
    ("klasouzytki_egib", pa.string()),
    ("grupa_rejestrowa", pa.int32()),
    ("pozostale_atrybuty", pa.string()),
    ("czas_pozyskania", pa.string()),
    ("geometry", pa.binary()),
    (
        "geometry_bbox",
        pa.struct([(f, pa.float64()) for f in ("xmin", "ymin", "xmax", "ymax")]),
    ),
]


def kraj_parquet_schema(with_bbox: bool = True) -> pa.schema:
    fields = list(KRAJ_SCHEMA_FIELDS) if with_bbox else KRAJ_SCHEMA_FIELDS[:-1]
    return pa.schema(fields)


def polygon_at(easting: float, northing: float, size: float = 50.0) -> Polygon:
    """A square polygon around (easting, northing) in EPSG:2180 metres."""
    return Polygon(
        [
            (easting, northing),
            (easting + size, northing),
            (easting + size, northing + size),
            (easting, northing + size),
            (easting, northing),
        ]
    )


def bbox_struct(geom: Polygon) -> dict[str, float]:
    minx, miny, maxx, maxy = geom.bounds
    return {"xmin": minx, "ymin": miny, "xmax": maxx, "ymax": maxy}


def make_row(
    teryt: str = "141701_1.0022.2/2",
    *,
    easting: float = 524_000.0,
    northing: float = 481_000.0,
    pole_ewidencyjne: float | None = None,
    klasouzytki_egib: str | None = "Ls",
) -> dict[str, Any]:
    """One synthetic kraj row: TERYT + EPSG:2180 geometry + export attributes."""
    parts = teryt.split("_", 1)
    voiv = parts[0][:2] if parts else "14"
    obreb, number = ("0022", "1")
    if len(parts) > 1:
        pieces = parts[1].split(".")
        if len(pieces) == 3:
            obreb, number = pieces[1], pieces[2]
    geom = polygon_at(easting, northing)
    return {
        "id_dzialki": teryt,
        "numer_dzialki": number,
        "nazwa_obrebu": f"OBREB_{obreb}",
        "numer_obrebu": obreb,
        "numer_jednostki": voiv + "_JED",
        "nazwa_gminy": f"GMINA_{voiv}",
        "data": "2026-10-11 00:00:00",
        "pole_ewidencyjne": None if pole_ewidencyjne is None else Decimal(str(pole_ewidencyjne)),
        "klasouzytki_egib": klasouzytki_egib,
        "grupa_rejestrowa": 1,
        "pozostale_atrybuty": "{}",
        "czas_pozyskania": "2026-10-11 22:00",
        "geometry": to_wkb(geom),
        "geometry_bbox": bbox_struct(geom),
    }


def write_kraj_parquet(path: Path, rows: list[dict[str, Any]], *, with_bbox: bool = True) -> Path:
    table = build_table(rows, with_bbox=with_bbox)
    pq.write_table(table, path)
    return path


def crazy_feeds_increment(row_groups: int, rows_per_group: int) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    for gi in range(row_groups):
        groups.append(
            [
                make_row(
                    f"1417{gi:02d}_2.0001.{i}/{gi + 1}",
                    easting=524_000.0 + i * 100,
                    northing=481_000.0 + gi * 100,
                )
                for i in range(rows_per_group)
            ]
        )
    return groups


def build_table(rows: list[dict[str, Any]], *, with_bbox: bool = True) -> pa.Table:
    schema = kraj_parquet_schema(with_bbox=with_bbox)
    columns = [
        pa.array([row.get(name) for row in rows], type=field.type)
        for name, field in zip(schema.names, schema, strict=True)
    ]
    return pa.Table.from_arrays(columns, schema=schema)


def write_multigroup_parquet(path: Path, groups: list[list[dict[str, Any]]]) -> Path:
    schema = kraj_parquet_schema()
    with pq.ParquetWriter(path, schema) as writer:
        for rows in groups:
            writer.write_table(build_table(rows))
    return path


def read_parquet_geometries(path: Path) -> gpd.GeoSeries:
    import pyarrow.parquet as _pq

    table = _pq.read_table(path)
    geoms = from_wkb(table.column("geometry").to_pylist())
    return gpd.GeoSeries(geoms, index=pd.Series(table.column("id_dzialki").to_pylist()), crs=2180)


def to_wkb_polygon(geom: Polygon) -> bytes:
    return to_wkb(geom)
