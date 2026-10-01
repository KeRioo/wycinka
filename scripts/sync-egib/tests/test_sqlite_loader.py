"""Tests for SQLite loader (R-tree, batch import, point query)."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import pytest
from hypothesis import HealthCheck, given, settings as hyp_settings
from hypothesis import strategies as st
from shapely.geometry import Polygon, box

from egib_sync.merger import write_minimal_gpkg
from egib_sync.sqlite_loader import (
    GpkgSchemaError,
    SCHEMA_VERSION,
    geojson_parcel,
    init_db,
    iter_parcels_as_geojson,
    load_parcels_from_gpkg,
    parcels_count,
    point_query,
    read_sync_meta,
    update_sync_meta,
    vacuum,
)


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "parcels.sqlite"


@pytest.fixture
def small_gpkg(tmp_path: Path) -> Path:
    return write_minimal_gpkg(tmp_path / "small.gpkg", n_rows=3)


def test_init_db_when_called_then_creates_all_tables(db_path: Path) -> None:
    init_db(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
        ).fetchall()
        names = {r[0] for r in rows}
        for expected in (
            "parcels",
            "parcels_rtree",
            "parcels_rtree_map",
            "sync_meta",
            "schema_meta",
        ):
            assert expected in names, f"missing table: {expected}"
    finally:
        conn.close()


def test_init_db_when_called_then_creates_indexes(db_path: Path) -> None:
    init_db(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_parcels_%'"
        ).fetchall()
        names = {r[0] for r in rows}
        assert {
            "idx_parcels_teryt",
            "idx_parcels_voivodeship",
            "idx_parcels_county",
            "idx_parcels_commune",
            "idx_parcels_number",
        } <= names
    finally:
        conn.close()


def test_init_db_records_schema_version(db_path: Path) -> None:
    init_db(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("SELECT version FROM schema_meta").fetchone()
        assert row is not None
        assert row[0] == SCHEMA_VERSION
    finally:
        conn.close()


def test_init_db_when_called_twice_then_idempotent(db_path: Path) -> None:
    init_db(db_path)
    init_db(db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("SELECT COUNT(*) FROM schema_meta").fetchone()
        assert rows[0] == 1
    finally:
        conn.close()


def test_init_db_creates_parents(tmp_path: Path) -> None:
    db = tmp_path / "deep" / "nested" / "x.sqlite"
    init_db(db)
    assert db.exists()


def test_load_parcels_from_gpkg_when_valid_then_imports(
    small_gpkg: Path, db_path: Path
) -> None:
    n = load_parcels_from_gpkg(small_gpkg, db_path)
    assert n == 3
    assert parcels_count(db_path) == 3


def test_load_parcels_from_gpkg_creates_rtree_rows(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("SELECT COUNT(*) FROM parcels_rtree").fetchone()
        assert rows[0] == 3
        map_rows = conn.execute("SELECT COUNT(*) FROM parcels_rtree_map").fetchone()
        assert map_rows[0] == 3
    finally:
        conn.close()


def test_load_parcels_from_gpkg_maps_text_ids_to_rtree_rowids(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute(
            """
            SELECT p.id, m.rtree_id
              FROM parcels p
              JOIN parcels_rtree_map m ON m.parcel_id = p.id
            """
        ).fetchall()
        assert len(rows) == 3
        for parcel_id, rtree_id in rows:
            assert parcel_id.startswith("141201_1.000")
            assert isinstance(rtree_id, int)
            assert rtree_id > 0
            assert (
                conn.execute(
                    "SELECT 1 FROM parcels_rtree WHERE id = ?", (rtree_id,)
                ).fetchone()
                is not None
            )
    finally:
        conn.close()


def test_load_parcels_when_missing_input_then_raises(tmp_path: Path, db_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_parcels_from_gpkg(tmp_path / "nope.gpkg", db_path)


def test_load_parcels_when_gpkg_missing_columns_then_raises(
    tmp_path: Path, db_path: Path
) -> None:
    bad = tmp_path / "bad.gpkg"
    import pandas as pd

    gdf = gpd.GeoDataFrame(
        {"foo": ["a", "b"]}, geometry=[Polygon([(0, 0), (1, 0), (1, 1), (0, 1)]), None], crs="EPSG:4326"
    )
    gdf.to_file(str(bad), driver="GPKG")
    with pytest.raises(GpkgSchemaError):
        load_parcels_from_gpkg(bad, db_path)


def test_load_parcels_when_empty_gpkg_then_zero(
    tmp_path: Path, db_path: Path
) -> None:
    empty = tmp_path / "empty.gpkg"
    gdf = gpd.GeoDataFrame(
        {"id": [], "teryt": [], "geometry": []}, geometry="geometry", crs="EPSG:4326"
    )
    gdf.to_file(str(empty), driver="GPKG")
    n = load_parcels_from_gpkg(empty, db_path)
    assert n == 0
    assert parcels_count(db_path) == 0


def test_load_parcels_full_reload_truncates_existing(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    assert parcels_count(db_path) == 3
    load_parcels_from_gpkg(small_gpkg, db_path)
    assert parcels_count(db_path) == 3


def test_load_parcels_when_batch_size_zero_then_raises(small_gpkg: Path, db_path: Path) -> None:
    with pytest.raises(ValueError, match="batch_size"):
        load_parcels_from_gpkg(small_gpkg, db_path, batch_size=0)


def test_load_parcels_1000_parcels_under_5s(tmp_path: Path, db_path: Path) -> None:
    n_rows = 1000
    base_lng, base_lat = 19.0, 50.0
    step = 0.0005
    columns: dict[str, Any] = {
        "id": [f"141201_1.0001.{i}" for i in range(n_rows)],
        "teryt": [f"141201_1.0001.{i}" for i in range(n_rows)],
        "number": [str(i) for i in range(n_rows)],
        "voivodeship": ["mazowieckie"] * n_rows,
        "voivodeship_code": ["14"] * n_rows,
        "county": ["Warszawa"] * n_rows,
        "county_code": ["1201"] * n_rows,
        "commune": ["Warszawa"] * n_rows,
        "commune_code": ["141201"] * n_rows,
        "region": ["0001"] * n_rows,
        "region_name": ["Obreb 1"] * n_rows,
        "area_m2": [100.0] * n_rows,
        "land_use": ["Ls"] * n_rows,
    }
    polygons = [
        box(base_lng + i * step, base_lat + j * step, base_lng + (i + 1) * step, base_lat + (j + 1) * step)
        for j in range(1)
        for i in range(n_rows)
    ]
    gdf = gpd.GeoDataFrame(columns, geometry=polygons, crs="EPSG:4326")
    gdf_path = tmp_path / "many.gpkg"
    gdf.to_file(str(gdf_path), driver="GPKG")

    t0 = time.perf_counter()
    n = load_parcels_from_gpkg(gdf_path, db_path, batch_size=500)
    elapsed = time.perf_counter() - t0
    assert n == n_rows
    assert parcels_count(db_path) == n_rows
    assert elapsed < 5.0, f"load took {elapsed:.2f}s for {n_rows} rows"


def test_point_query_when_point_inside_parcel_returns_it(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    result = point_query(db_path, lat=52.002, lng=21.002)
    assert result is not None
    assert result["id"].startswith("141201_1.000")
    assert result["geom_wkt"].startswith("POLYGON")


def test_point_query_when_point_outside_all_parcels_returns_none(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    assert point_query(db_path, lat=10.0, lng=10.0) is None
    assert point_query(db_path, lat=60.0, lng=30.0) is None


def test_point_query_when_point_on_parcel_border_returns_it(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    result = point_query(db_path, lat=52.0, lng=21.0)
    assert result is not None
    assert result["id"].startswith("141201_1.000")


def test_point_query_when_db_missing_then_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        point_query(tmp_path / "nope.sqlite", lat=52.0, lng=21.0)


def test_point_query_returns_full_parcel_dict(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    result = point_query(db_path, lat=52.002, lng=21.002)
    assert result is not None
    for key in (
        "id",
        "teryt",
        "number",
        "voivodeship",
        "county",
        "commune",
        "region",
        "area_m2",
        "land_use",
        "geom_wkt",
        "centroid_lng",
        "centroid_lat",
        "fetched_at",
        "datasource",
    ):
        assert key in result


def test_update_sync_meta_when_called_then_persists_keys(
    db_path: Path, tmp_path: Path
) -> None:
    init_db(db_path)
    pmt = tmp_path / "poland.pmtiles"
    update_sync_meta(
        db_path,
        parcels_count=100,
        etag="abc",
        pmtiles_path=pmt,
    )
    meta = read_sync_meta(db_path)
    assert meta["parcels_count"] == "100"
    assert meta["egib_etag"] == "abc"
    assert meta["pmtiles_path"] == str(pmt)
    assert "last_sync" in meta


def test_update_sync_meta_when_extras_then_persists_too(
    db_path: Path, tmp_path: Path
) -> None:
    update_sync_meta(
        db_path,
        parcels_count=5,
        etag="e1",
        pmtiles_path=tmp_path / "x.pmtiles",
        extras={"source": "geoportal", "region": "mazowieckie"},
    )
    meta = read_sync_meta(db_path)
    assert meta["source"] == "geoportal"
    assert meta["region"] == "mazowieckie"


def test_update_sync_meta_upserts_values(db_path: Path, tmp_path: Path) -> None:
    pmt = tmp_path / "x.pmtiles"
    update_sync_meta(db_path, parcels_count=1, etag="v1", pmtiles_path=pmt)
    update_sync_meta(db_path, parcels_count=2, etag="v2", pmtiles_path=pmt)
    meta = read_sync_meta(db_path)
    assert meta["parcels_count"] == "2"
    assert meta["egib_etag"] == "v2"


def test_read_sync_meta_when_db_missing_then_empty(tmp_path: Path) -> None:
    assert read_sync_meta(tmp_path / "nope.sqlite") == {}


def test_parcels_count_when_db_missing_then_zero(tmp_path: Path) -> None:
    assert parcels_count(tmp_path / "nope.sqlite") == 0


def test_vacuum_when_db_missing_then_noop(tmp_path: Path) -> None:
    vacuum(tmp_path / "nope.sqlite")


def test_vacuum_when_db_present_then_succeeds(db_path: Path) -> None:
    init_db(db_path)
    vacuum(db_path)


def test_geojson_parcel_when_called_then_returns_feature(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    parcel = point_query(db_path, lat=52.002, lng=21.002)
    assert parcel is not None
    gj = geojson_parcel(parcel)
    assert gj["type"] == "Feature"
    assert gj["id"] == parcel["id"]
    assert gj["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert "geom_wkt" not in gj["properties"]


def test_iter_parcels_as_geojson_streams_all(
    small_gpkg: Path, db_path: Path
) -> None:
    load_parcels_from_gpkg(small_gpkg, db_path)
    features = list(iter_parcels_as_geojson(db_path, batch_size=2))
    assert len(features) == 3
    for f in features:
        assert f["type"] == "Feature"
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_iter_parcels_as_geojson_when_db_missing_then_empty(tmp_path: Path) -> None:
    assert list(iter_parcels_as_geojson(tmp_path / "nope.sqlite")) == []


def test_load_parcels_handles_polygon_with_hole(tmp_path: Path, db_path: Path) -> None:
    outer = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]
    hole = [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8), (0.2, 0.2)]
    poly = Polygon(outer, holes=[hole])
    columns = {
        "id": ["141201_1.0001.9999"],
        "teryt": ["141201_1.0001.9999"],
        "number": ["9999"],
        "voivodeship": ["mazowieckie"],
        "voivodeship_code": ["14"],
        "county": ["Warszawa"],
        "county_code": ["1201"],
        "commune": ["Warszawa"],
        "commune_code": ["141201"],
        "region": ["0001"],
        "region_name": ["Obreb 1"],
        "area_m2": [500.0],
        "land_use": ["Ls"],
    }
    gdf = gpd.GeoDataFrame(columns, geometry=[poly], crs="EPSG:4326")
    p = tmp_path / "hole.gpkg"
    gdf.to_file(str(p), driver="GPKG")
    n = load_parcels_from_gpkg(p, db_path)
    assert n == 1
    inside = point_query(db_path, lat=0.1, lng=0.1)
    assert inside is not None
    assert inside["id"] == "141201_1.0001.9999"
    inside_outer = point_query(db_path, lat=0.9, lng=0.1)
    assert inside_outer is not None
    in_hole = point_query(db_path, lat=0.5, lng=0.5)
    assert in_hole is None
    outside = point_query(db_path, lat=2.0, lng=2.0)
    assert outside is None


def test_load_parcels_reprojects_to_wgs84(tmp_path: Path, db_path: Path) -> None:
    poly = Polygon([(2500000, 6500000), (2500050, 6500000), (2500050, 6500050), (2500000, 6500050)])
    columns = {
        "id": ["141201_1.0001.1"],
        "teryt": ["141201_1.0001.1"],
        "number": ["1"],
        "voivodeship": ["mazowieckie"],
        "voivodeship_code": ["14"],
        "county": ["Warszawa"],
        "county_code": ["1201"],
        "commune": ["Warszawa"],
        "commune_code": ["141201"],
        "region": ["0001"],
        "region_name": ["Obreb 1"],
        "area_m2": [100.0],
        "land_use": ["Ls"],
    }
    gdf = gpd.GeoDataFrame(columns, geometry=[poly], crs="EPSG:3857")
    p = tmp_path / "3857.gpkg"
    gdf.to_file(str(p), driver="GPKG")
    n = load_parcels_from_gpkg(p, db_path)
    assert n == 1
    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute(
            "SELECT centroid_lng, centroid_lat FROM parcels WHERE id = ?",
            ("141201_1.0001.1",),
        ).fetchone()
        assert row is not None
        lng, lat = row
        assert -180.0 <= lng <= 180.0
        assert -90.0 <= lat <= 90.0
        assert lng < 30.0
    finally:
        conn.close()


def test_load_parcels_skips_features_without_geometry(
    tmp_path: Path, db_path: Path
) -> None:
    poly_a = Polygon([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])
    columns = {
        "id": ["ok_1", "none_1", "ok_2"],
        "teryt": ["ok_1", "none_1", "ok_2"],
        "number": ["1", "2", "3"],
        "voivodeship": ["m"] * 3,
        "voivodeship_code": ["14"] * 3,
        "county": ["c"] * 3,
        "county_code": ["1201"] * 3,
        "commune": ["c"] * 3,
        "commune_code": ["141201"] * 3,
        "region": ["0001"] * 3,
        "region_name": ["o"] * 3,
        "area_m2": [100.0] * 3,
        "land_use": ["Ls"] * 3,
    }
    gdf = gpd.GeoDataFrame(columns, geometry=[poly_a, None, poly_a], crs="EPSG:4326")
    p = tmp_path / "mixed.gpkg"
    gdf.to_file(str(p), driver="GPKG")
    n = load_parcels_from_gpkg(p, db_path)
    assert n == 2
    assert parcels_count(db_path) == 2


def _make_random_parcels_gdf(
    n: int, *, seed: int = 0
) -> gpd.GeoDataFrame:
    import random

    rng = random.Random(seed)
    rows = []
    for i in range(n):
        base_x = rng.uniform(14.0, 24.0)
        base_y = rng.uniform(49.0, 55.0)
        dx = rng.uniform(0.0005, 0.002)
        dy = rng.uniform(0.0005, 0.002)
        rows.append(
            {
                "id": f"141201_1.0001.{i}",
                "teryt": f"141201_1.0001.{i}",
                "number": str(i),
                "voivodeship": "mazowieckie",
                "voivodeship_code": "14",
                "county": "Warszawa",
                "county_code": "1201",
                "commune": "Warszawa",
                "commune_code": "141201",
                "region": "0001",
                "region_name": "Obreb",
                "area_m2": 100.0 + i,
                "land_use": "Ls",
                "geometry": Polygon(
                    [
                        (base_x, base_y),
                        (base_x + dx, base_y),
                        (base_x + dx, base_y + dy),
                        (base_x, base_y + dy),
                    ]
                ),
            }
        )
    return gpd.GeoDataFrame(rows, crs="EPSG:4326")


@st.composite
def _parcels_strategy(draw: Any) -> gpd.GeoDataFrame:
    n = draw(st.integers(min_value=1, max_value=20))
    seed = draw(st.integers(min_value=0, max_value=10_000))
    return _make_random_parcels_gdf(n, seed=seed)


@given(gdf=_parcels_strategy())
@hyp_settings(
    max_examples=20,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_property_roundtrip_random_gdf(gdf: gpd.GeoDataFrame) -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        gpkg = td_path / "in.gpkg"
        db = td_path / "out.sqlite"
        gdf.to_file(str(gpkg), driver="GPKG")
        n = load_parcels_from_gpkg(gpkg, db)
        assert n == len(gdf)
        assert parcels_count(db) == len(gdf)

        conn = sqlite3.connect(str(db))
        try:
            count_rtree = conn.execute("SELECT COUNT(*) FROM parcels_rtree").fetchone()[0]
            count_map = conn.execute("SELECT COUNT(*) FROM parcels_rtree_map").fetchone()[0]
            assert count_rtree == len(gdf)
            assert count_map == len(gdf)
        finally:
            conn.close()

        for _, row in gdf.iterrows():
            poly = row.geometry
            cx = (poly.bounds[0] + poly.bounds[2]) / 2
            cy = (poly.bounds[1] + poly.bounds[3]) / 2
            result = point_query(db, lat=cy, lng=cx)
            assert result is not None
            assert result["id"] == row["id"]
