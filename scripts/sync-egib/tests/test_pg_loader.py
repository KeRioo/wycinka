"""Testy PostGIS loadera (bez realnego Postgresa — same pure helpers)."""

from __future__ import annotations

import gzip
import json
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from egib_sync.pg_loader import (
    COPY_COLUMNS,
    INDEXES_SQL,
    SCHEMA_SQL,
    PgLoaderError,
    copy_line,
    iter_copy_lines,
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
        assert isinstance(mapping["geometry"], str)  # WKT text for COPY
        assert mapping["geometry"].startswith("POLYGON")
        assert mapping["id"] == "126104_9.0084.255/20"
        assert mapping["voivodeship_code"] == "12"
        assert mapping["area_m2"] == pytest.approx(1250.5)
        assert mapping["geom_wkt"].startswith("POLYGON ((")
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


class TestIterCopyLines:
    async def test_streams_lines_and_skips_null_geometry(self, tmp_path: Path) -> None:
        shard = tmp_path / "kraj_dzialki.geojsonl.gz.shard0"
        with gzip.open(shard, "wt", encoding="utf-8") as fh:
            for feature in (
                _feature(),
                {"id": "x", "geometry": None},
                _feature("100206_2.0019.52/6"),
            ):
                fh.write(json.dumps(feature) + "\n")

        lines = [
            line
            async for line in iter_copy_lines(
                [shard],
                expected_rows=38_841_461,
                fetched_at="2026-10-13T10:00:00Z",
                datasource="parq",
            )
        ]
        assert len(lines) == 2
        assert lines[0].startswith(
            b"126104_9.0084.255/20\t126104_9.0084.255/20\t255/20\tma\xc5\x82opolskie\n"
        ) or lines[0].startswith(b"126104_9.0084.255/20\t")


class TestCopyLineAndMeter:
    def test_copy_line_escapes_and_nulls(self) -> None:
        line = copy_line(("a\tb", None, 1.5, "x"))
        assert line == b"a\\tb\t\\N\t1.5\tx\n"

    def test_copy_line_plain(self) -> None:
        assert copy_line(("a", "b")) == b"a\tb\n"

    async def test_meter_counts_rows(self, tmp_path: Path) -> None:
        from egib_sync.pg_loader import ProgressMeter

        async def gen() -> AsyncIterator[bytes]:
            for _ in range(3):
                yield b"x\n"

        meter = ProgressMeter(expected_rows=10)
        data = [chunk async for chunk in meter.wrap(gen())]
        assert meter.count == 3
        assert b"".join(data) == b"x\n" * 3


class TestSchemaSql:
    def test_schema_includes_geometry_and_gist(self) -> None:
        assert "geometry geometry(Geometry, 4326)" in SCHEMA_SQL
        assert "USING gist (geometry)" in INDEXES_SQL
        assert "sync_meta" in SCHEMA_SQL


class TestLoadFromShards:
    async def test_when_no_shards_raises(self) -> None:
        with pytest.raises(PgLoaderError, match="no shard"):
            await load_from_shards([], dsn="postgresql://x")

    async def test_when_index_only_then_no_shards_required(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import sys

        created: dict[str, list[str]] = {"calls": []}

        class FakeConn:
            async def execute(self, sql: str) -> None:
                created["calls"].append(sql[:40])

            async def fetchval(self, sql: str) -> int:  # noqa: ARG002
                return 0

            async def __aenter__(self) -> FakeConn:
                return self

            async def __aexit__(self, *args: object) -> None:
                return None

        class FakePool:
            def acquire(self) -> FakeConn:
                # sync call: `async with pool.acquire()` consumes the CM directly
                return FakeConn()

            async def close(self) -> None:
                return None

        class FakeAsyncpg:
            @staticmethod
            async def create_pool(dsn: str, **kwargs: object) -> FakePool:  # noqa: ARG004
                return FakePool()

        monkeypatch.setitem(sys.modules, "asyncpg", FakeAsyncpg)
        rows = await load_from_shards([], dsn="postgresql://x", index_only=True)
        assert rows == 0
        assert any("CREATE INDEX" in c for c in created["calls"])
