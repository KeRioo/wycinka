"""Tests for the kraj pipeline orchestration (sample-driven, tippecanoe-optional)."""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from egib_sync.config import KrajSettings, Settings
from egib_sync.kraj_pipeline import (
    count_parcel_duplicates,
    estimate_kraj_disk_bytes,
    run_kraj_pipeline,
)
from tests.helpers.kraj_parquet_builder import write_multigroup_parquet, make_row

TIPPECANOE_AVAILABLE = shutil.which("tippecanoe") is not None

tip = pytest.mark.skipif(not TIPPECANOE_AVAILABLE, reason="tippecanoe binary not available")


@pytest.fixture
def sample_parquet(tmp_path: Path) -> Path:
    groups = [
        [
            make_row(
                f"141701_1.0022.{i}/{g}",
                easting=524_000.0 + i * 200,
                northing=481_000.0 + g * 10,
                pole_ewidencyjne=100.0 + i,
                klasouzytki_egib="Ls",
            )
            for i in range(4)
        ]
        for g in range(2)
    ]
    return write_multigroup_parquet(tmp_path / "sample.parquet", groups)


@pytest.fixture
def kraj_settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        log_json=False,
        log_level="ERROR",
        kraj=KrajSettings(min_zoom=12, max_zoom=14, base_zoom=14),
    )


@tip
def test_run_kraj_pipeline_when_full_then_artifacts_and_counts(
    sample_parquet: Path, kraj_settings: Settings
):
    result = run_kraj_pipeline(kraj_settings, parquet_path=sample_parquet)

    assert result.success, result.errors
    assert result.parcels_count == 8
    assert result.parquet_rows == 8
    assert result.skipped_parcel_count == 0
    assert result.duplicate_count == 0
    assert result.geojsonseq_bytes > 0
    assert result.pmtiles_bytes > 0
    assert result.sqlite_bytes > 0
    assert not result.geojsonseq_path.exists()
    conn = sqlite3.connect(str(result.sqlite_path))
    try:
        meta = dict(conn.execute("SELECT key, value FROM sync_meta").fetchall())
    finally:
        conn.close()
    assert meta["parcels_count"] == "8"
    assert meta["pipeline"] == "kraj-parquet"


def test_run_kraj_pipeline_when_sqlite_only_then_no_tiles_or_geojsonseq(
    sample_parquet: Path, kraj_settings: Settings
):
    result = run_kraj_pipeline(kraj_settings, parquet_path=sample_parquet, skip_tiles=True)

    assert result.success, result.errors
    assert result.sqlite_path.exists()
    assert not result.geojsonseq_path.exists()
    assert result.pmtiles_bytes == 0
    assert result.sqlite_bytes > 0
    assert count_parcel_duplicates(result.sqlite_path) == 0
    conn = sqlite3.connect(str(result.sqlite_path))
    try:
        meta = dict(conn.execute("SELECT key, value FROM sync_meta").fetchall())
    finally:
        conn.close()
    assert meta["pipeline"] == "kraj-parquet"


def test_run_kraj_pipeline_when_missing_parquet_then_error(kraj_settings: Settings, tmp_path: Path):
    result = run_kraj_pipeline(kraj_settings, parquet_path=tmp_path / "nope.parquet")

    assert not result.success
    assert any("parquet" in e for e in result.errors)


def test_run_kraj_pipeline_when_dry_run_then_no_artifacts(
    sample_parquet: Path, kraj_settings: Settings
):
    result = run_kraj_pipeline(kraj_settings, parquet_path=sample_parquet, dry_run=True)

    assert result.success
    assert result.parquet_rows == 8
    assert not result.sqlite_path.exists()
    assert not result.pmtiles_path.exists()
    assert result.geojsonseq_bytes == 0


def test_run_kraj_pipeline_when_tippecanoe_fails_then_sqlite_kept_no_tiles(
    sample_parquet: Path, kraj_settings: Settings, monkeypatch: pytest.MonkeyPatch
):
    def raise_failure(*_: Any, **__: Any) -> Path:
        from egib_sync.pmtiles_gen import TippecanoeError

        raise TippecanoeError(1, "simulated tippecanoe crash", ["tippecanoe"])

    monkeypatch.setattr(
        "egib_sync.kraj_pipeline.generate_pmtiles_geojsonseq", raise_failure
    )

    result = run_kraj_pipeline(kraj_settings, parquet_path=sample_parquet)

    assert not result.success
    assert any("tiles" in error for error in result.errors)
    assert "simulated tippecanoe crash" in result.errors[0]
    assert result.sqlite_path.exists()
    assert result.parcels_count == 8
    assert not result.pmtiles_path.exists()


@tip
def test_run_tippecanoe_from_gzip_when_corrupt_gzip_then_error(tmp_path: Path):
    from egib_sync.pmtiles_gen import _run_tippecanoe_from_gzip

    corrupt = tmp_path / "bad.jsonl.gz"
    corrupt.write_bytes(b"\x1f\x8bGARBAGE-BEYOND-HEADER")

    with pytest.raises(Exception, match="gzip"):
        _run_tippecanoe_from_gzip(["sh", "-c", "true"], corrupt)


def test_count_parcel_duplicates_when_duplicate_teryt(tmp_path: Path):
    db = tmp_path / "dup.sqlite"
    conn = sqlite3.connect(str(db))
    try:
        conn.execute("CREATE TABLE parcels (id TEXT, teryt TEXT)")
        conn.execute("INSERT INTO parcels VALUES ('a', 'a')")
        conn.execute("INSERT INTO parcels VALUES ('b', 'a')")
        conn.execute("INSERT INTO parcels VALUES ('c', 'c')")
        conn.commit()
    finally:
        conn.close()

    assert count_parcel_duplicates(db) == 1
    assert count_parcel_duplicates(tmp_path / "missing.sqlite") == 0


def test_count_parcel_duplicates_when_prod_schema_unique_teryt_then_zero(tmp_path: Path):
    from egib_sync.sqlite_loader import init_db

    db = tmp_path / "prod.sqlite"
    init_db(db)
    conn = sqlite3.connect(str(db))
    try:
        conn.execute(
            "INSERT INTO parcels (id, teryt, number, voivodeship, voivodeship_code, "
            "county, county_code, commune, commune_code, region, area_m2, geom_wkt, "
            "centroid_lng, centroid_lat, bbox_min_lng, bbox_min_lat, bbox_max_lng, "
            "bbox_max_lat, fetched_at, datasource, land_use, region_name) VALUES "
            "('a', 'a', '1', '', '', '', '', '', '', '', 0, 'POLYGON EMPTY', "
            "0, 0, 0, 0, 0, 0, '', 'test', 'Ls', 'OBREB')"
        )
        conn.commit()
    finally:
        conn.close()

    assert count_parcel_duplicates(db) == 0


def test_estimate_kraj_disk_bytes_when_country_scale_then_budget_reported():
    budget = estimate_kraj_disk_bytes(38_841_997)

    assert budget["geojsonseq_gz"] > 4_000_000_000
    assert budget["total_peak"] == budget["geojsonseq_gz"] + budget["sqlite"] + budget["pmtiles"]
