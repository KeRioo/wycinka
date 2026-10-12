"""Tests for the streaming SQLite loader (explicit rtree ids, batch transactions)."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest
from shapely.geometry import Polygon

from egib_sync.sqlite_loader import (
    load_parcels_stream,
    parcels_count,
    point_query,
    read_sync_meta,
)


def _parcel(teryt: str, lng: float, lat: float, **overrides: Any) -> dict[str, Any]:
    geometry = Polygon(
        [(lng, lat), (lng + 0.002, lat), (lng + 0.002, lat + 0.002), (lng, lat + 0.002), (lng, lat)]
    )
    record: dict[str, Any] = {
        "id": teryt,
        "teryt": teryt,
        "number": "1",
        "voivodeship": "mazowieckie",
        "voivodeship_code": "14",
        "county": "17",
        "county_code": "1417",
        "commune": "OTWOCK",
        "commune_code": "141701_2",
        "region": "0022",
        "region_name": "OTWOCK",
        "area_m2": 1500.0,
        "land_use": "Ls",
        "geometry": geometry,
    }
    record.update(overrides)
    return record


def _parcel_stream(count: int) -> list[dict[str, Any]]:
    return [_parcel(f"141701_1.0022.{i}", 21.0 + i * 0.01, 52.0) for i in range(count)]


def test_load_parcels_stream_when_smaller_than_batch_then_all_rows(tmp_path: Path):
    db = tmp_path / "staging.sqlite"

    inserted = load_parcels_stream(_parcel_stream(5), db, batch_size=50)

    assert inserted == 5
    assert parcels_count(db) == 5


def test_load_parcels_stream_when_multiple_batches_then_transctions_per_batch(tmp_path: Path):
    db = tmp_path / "staging.sqlite"

    inserted = load_parcels_stream(_parcel_stream(11), db, batch_size=4)

    assert inserted == 11
    conn = sqlite3.connect(str(db))
    try:
        ids = [
            row[0] for row in conn.execute("SELECT id FROM parcels_rtree ORDER BY id").fetchall()
        ]
    finally:
        conn.close()
    assert ids == list(range(1, 12))


def test_load_parcels_stream_when_point_query_then_finds_parcel(tmp_path: Path):
    db = tmp_path / "staging.sqlite"
    load_parcels_stream(_parcel_stream(4), db, batch_size=10)

    parcel = point_query(db, lat=52.0005, lng=21.0205)

    assert parcel is not None
    assert parcel["teryt"] == "141701_1.0022.2"
    assert parcel["voivodeship"] == "mazowieckie"
    assert parcel["land_use"] == "Ls"


def test_load_parcels_stream_when_duplicate_teryt_then_last_replaces(tmp_path: Path):
    db = tmp_path / "staging.sqlite"
    stream = _parcel_stream(3) + [_parcel("141701_1.0022.0", 25.0, 55.0, land_use="Ro")]

    inserted = load_parcels_stream(stream, db, batch_size=10)

    assert inserted == 4
    assert parcels_count(db) == 3
    parcel = point_query(db, lat=55.0, lng=25.0005)
    assert parcel is not None and parcel["land_use"] == "Ro"


def test_load_parcels_stream_when_null_geometry_then_skipped(tmp_path: Path):
    db = tmp_path / "staging.sqlite"
    stream = _parcel_stream(2)
    stream[1] = dict(stream[1], geometry=None)

    inserted = load_parcels_stream(stream, db, batch_size=10)

    assert inserted == 1
    assert parcels_count(db) == 1


def test_load_parcels_stream_when_invalid_batch_size_then_value_error(tmp_path: Path):
    db = tmp_path / "staging.sqlite"

    with pytest.raises(ValueError, match="batch_size"):
        load_parcels_stream(_parcel_stream(1), db, batch_size=0)


def test_load_parcels_stream_when_failure_mid_stream_then_no_db_left(tmp_path: Path):
    class Explode:
        def __iter__(self):
            return self

        def __next__(self):
            raise RuntimeError("disk is gone")

    db = tmp_path / "staging.sqlite"

    with pytest.raises(RuntimeError, match="disk is gone"):
        load_parcels_stream(Explode(), db, batch_size=2)

    assert not db.exists()


def test_load_parcels_stream_when_meta_then_sync_meta_written_by_caller(tmp_path: Path):
    db = tmp_path / "staging.sqlite"
    load_parcels_stream(_parcel_stream(2), db, batch_size=10)

    assert "last_sync" not in read_sync_meta(db)
