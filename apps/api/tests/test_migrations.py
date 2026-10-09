"""Tests for Alembic migrations (initial schema on an empty SQLite database)."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from alembic import command
from alembic.config import Config
from app.core.db import Database

if TYPE_CHECKING:
    from collections.abc import Iterator

API_ROOT = Path(__file__).resolve().parent.parent
EXPECTED_TABLES = {"parcels", "parcels_rtree_map", "parcels_rtree", "sync_meta"}
EXPECTED_TRIGGERS = {"parcels_rtree_insert", "parcels_rtree_delete"}
EXPECTED_INDEXES = {
    "idx_parcels_teryt",
    "idx_parcels_voivodeship",
    "idx_parcels_county",
    "idx_parcels_commune",
    "idx_parcels_number",
    "idx_parcels_rtree_map_parcel",
}

_PARCEL_ROW = {
    "id": "141201_1.0001.6509",
    "teryt": "141201_1.0001.6509",
    "number": "6509",
    "voivodeship": "mazowieckie",
    "voivodeship_code": "14",
    "county": "Warszawa",
    "county_code": "1201",
    "commune": "M. ST. Warszawa",
    "commune_code": "1412011",
    "region": "0001",
    "region_name": None,
    "area_m2": 1250.0,
    "land_use": "Ls",
    "geom_wkt": ("POLYGON((21.0 52.2, 21.01 52.2, 21.01 52.21, 21.0 52.21, 21.0 52.2))"),
    "centroid_lng": 21.005,
    "centroid_lat": 52.205,
    "bbox_min_lng": 21.0,
    "bbox_min_lat": 52.2,
    "bbox_max_lng": 21.01,
    "bbox_max_lat": 52.21,
    "fetched_at": "2026-10-09T00:00:00Z",
    "datasource": "geoportal.gov.pl",
}


@pytest.fixture
def db_path(tmp_path: Path) -> Iterator[Path]:
    yield tmp_path / "parcels.sqlite"


def _alembic_config(db_path: Path) -> Config:
    config = Config(API_ROOT / "alembic.ini")
    config.set_main_option("script_location", str(API_ROOT / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def _sqlite_objects(path: Path) -> dict[str, set[str]]:
    conn = sqlite3.connect(path)
    try:
        rows = conn.execute(
            "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
        ).fetchall()
    finally:
        conn.close()
    objects: dict[str, set[str]] = {}
    for object_type, name in rows:
        objects.setdefault(str(object_type), set()).add(str(name))
    return objects


def _column_names(path: Path, table: str) -> set[str]:
    conn = sqlite3.connect(path)
    try:
        cursor = conn.execute(f"PRAGMA table_info({table})")
        return {str(row[1]) for row in cursor.fetchall()}
    finally:
        conn.close()


def test_migrations_when_empty_sqlite_then_full_schema(db_path: Path) -> None:
    command.upgrade(_alembic_config(db_path), "head")

    objects = _sqlite_objects(db_path)
    assert objects["table"] >= EXPECTED_TABLES, objects["table"]
    assert objects.get("trigger", set()) >= EXPECTED_TRIGGERS
    assert objects.get("index", set()) >= EXPECTED_INDEXES
    assert "schema_version" not in objects["table"]


def test_migrations_when_table_parcels_then_expected_columns(db_path: Path) -> None:
    command.upgrade(_alembic_config(db_path), "head")

    columns = _column_names(db_path, "parcels")
    assert {
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
        "geom_wkt",
        "centroid_lng",
        "centroid_lat",
        "bbox_min_lng",
        "bbox_min_lat",
        "bbox_max_lng",
        "bbox_max_lat",
        "fetched_at",
        "datasource",
    } <= columns


def test_migrations_when_sync_meta_then_matches_schema_meta_keys(
    db_path: Path,
) -> None:
    command.upgrade(_alembic_config(db_path), "head")
    assert {"key", "value", "updated_at"} <= _column_names(db_path, "sync_meta")


async def test_migrations_when_apply_then_rtree_triggers_work(db_path: Path) -> None:
    command.upgrade(_alembic_config(db_path), "head")

    db = Database.open(db_path)
    try:
        placeholders = ", ".join("?" for _ in _PARCEL_ROW)
        await db.execute(
            f"INSERT INTO parcels VALUES ({placeholders})",
            tuple(_PARCEL_ROW.values()),
            commit=True,
        )

        rtree_rows = await db.fetch_all(
            "SELECT id, min_lng, max_lng, min_lat, max_lat FROM parcels_rtree",
        )
        map_rows = await db.fetch_all(
            "SELECT parcel_id, rtree_id FROM parcels_rtree_map",
        )
        assert len(rtree_rows) == 1
        assert len(map_rows) == 1
        assert map_rows[0]["parcel_id"] == _PARCEL_ROW["id"]
        assert rtree_rows[0]["id"] == map_rows[0]["rtree_id"]

        await db.execute("DELETE FROM parcels", commit=True)
        assert await db.fetch_all("SELECT parcel_id FROM parcels_rtree_map") == []
    finally:
        await db.close()


async def test_migrations_when_apply_then_sync_meta_helpers_work(
    db_path: Path,
) -> None:
    command.upgrade(_alembic_config(db_path), "head")

    db = Database.open(db_path)
    try:
        await db.set_sync_meta("last_sync", "2026-10-09T03:00:00Z")
        assert await db.get_sync_meta("last_sync") == "2026-10-09T03:00:00Z"
    finally:
        await db.close()


def test_migrations_when_downgrade_then_tables_dropped(db_path: Path) -> None:
    config = _alembic_config(db_path)
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    objects = _sqlite_objects(db_path)
    assert EXPECTED_TABLES.isdisjoint(objects["table"])
    assert EXPECTED_TRIGGERS.isdisjoint(objects.get("trigger", set()))
