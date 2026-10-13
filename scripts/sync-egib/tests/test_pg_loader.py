"""Testy PostGIS loadera (bez realnego Postgresa — same pure helpers)."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import pytest

from egib_sync.pg_loader import (
    COPY_COLUMNS,
    INDEXES_SQL,
    SCHEMA_SQL,
    PgLoaderError,
    iter_shard_rows,
    load_from_shards,
    row_from_feature,
)


def _feature(feature_id: str = "126104_9.0084.255/20", voiv: str = "12") -> dict:
    return {
        "type": "Feature",
        "id": feature_id,
        "properties": {
            "id": feature_id,
            "teryt": feature_id,
            "number": "255/20",
            "voivodeship": "małopolskie",
            "voivodeship_code": voiv,
            "county": "61",
            "county_code": "1261",
            "commune": "KUTNO",
            "commune_code": "126104_9",
            "region": "0084",
            "region_name": "NOWA WIEŚ",
            "area_m2": 1250.5,
            "land_use": "Ls",
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[19.35, 52.19], [19.36, 52.19], [19.36, 52.20], [19.35, 52.20], [19.35, 52.19]]
            ],
        },
    }


class TestRowFromFeature:
    def test_happy_path_returns_all_columns(self) -> None:
        row = row_from_feature(_feature(), fetched_at="2026-10-13T10:00:00Z", datasource="parq")
        assert len(row) == len(COPY_COLUMNS)
        mapping = dict(zip(COPY_COLUMNS, row, strict=True))
        assert mapping["id"] == "126104_9.0084.255/20"
        assert mapping["voivodeship_code"] == "12"
        assert mapping["area_m2"] == pytest.approx(1250.5)
        assert mapping["geom_wkt"].startswith("POLYGON ((")
        assert isinstance(mapping["geometry"], bytes)
        assert mapping["bbox_max_lng"] == pytest.approx(19.36)
        assert mapping["centroid_lat"] == pytest.approx(52.195)

    def test_when_no_geometry_then_none(self) -> None:
        feature = _feature()
        feature["geometry"] = None
        assert row_from_feature(feature, fetched_at="x", datasource="d") is None

    def test_when_geometry_invalid_type_then_none(self) -> None:
        feature = _feature()
        feature["geometry"] = "not-a-mapping"
        assert row_from_feature(feature, fetched_at="x", datasource="d") is None

    def test_when_area_nan_then_zero(self) -> None:
        feature = _feature()
        feature["properties"]["area_m2"] = float("nan")
        row = row_from_feature(feature, fetched_at="x", datasource="d")
        mapping = dict(zip(COPY_COLUMNS, row, strict=True))
        assert mapping["area_m2"] == 0.0


class TestIterShardRows:
    async def test_streams_rows_and_skips_none(self, tmp_path: Path) -> None:
        shard = tmp_path / "kraj_dzialki.geojsonl.gz.shard0"
        with gzip.open(shard, "wt", encoding="utf-8") as fh:
            for feature in (
                _feature(),
                {"id": "x", "geometry": None},
                _feature("100206_2.0019.52/6"),
            ):
                fh.write(json.dumps(feature) + "\n")

        rows = [
            row
            async for row in iter_shard_rows(
                [shard], fetched_at="2026-10-13T10:00:00Z", datasource="parq"
            )
        ]
        assert len(rows) == 2
        assert rows[0][0] == "126104_9.0084.255/20"


class TestSchemaSql:
    def test_schema_includes_geometry_and_gist(self) -> None:
        assert "geometry geometry(Geometry, 4326)" in SCHEMA_SQL
        assert "USING gist (geometry)" in INDEXES_SQL
        assert "sync_meta" in SCHEMA_SQL


class TestLoadFromShards:
    async def test_when_no_shards_raises(self) -> None:
        with pytest.raises(PgLoaderError, match="no shard"):
            await load_from_shards([], dsn="postgresql://x")
