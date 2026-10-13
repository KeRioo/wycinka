"""PostGIS loader — text COPY streaming of staged GeoJSONSeq into PostgreSQL.

Design (kraj dataset, ~38.8M rows):
  * rows stream from already-staged gzip GeoJSONSeq shards (no parquet re-read),
  * asyncpg text COPY (``copy_to_table``) — geometry column accepts WKT text,
    so shapely serializes once (wkt) and no binary encoder is needed
    (asyncpg has none for the PostGIS ``geometry`` type),
  * GIST/BTREE indexes are created after COPY (no index maintenance under load),
  * ``sync_meta`` gets etag + last_sync for the backend ``/api/v1/version``.
"""

from __future__ import annotations

import gzip
import json
import time
from collections.abc import AsyncIterator, Mapping, Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    import asyncpg
    from shapely.geometry.base import BaseGeometry

logger = structlog.get_logger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS parcels (
  id text PRIMARY KEY,
  teryt text NOT NULL UNIQUE,
  number text NOT NULL,
  voivodeship text NOT NULL,
  voivodeship_code text NOT NULL,
  county text NOT NULL,
  county_code text NOT NULL,
  commune text NOT NULL,
  commune_code text NOT NULL,
  region text NOT NULL,
  region_name text,
  area_m2 double precision NOT NULL,
  land_use text,
  geom_wkt text NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL,
  centroid_lng double precision NOT NULL,
  centroid_lat double precision NOT NULL,
  bbox_min_lng double precision NOT NULL,
  bbox_min_lat double precision NOT NULL,
  bbox_max_lng double precision NOT NULL,
  bbox_max_lat double precision NOT NULL,
  fetched_at text NOT NULL,
  datasource text NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at text NOT NULL
);
"""

INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_parcels_geometry_gist ON parcels USING gist (geometry);
CREATE INDEX IF NOT EXISTS idx_parcels_teryt ON parcels (teryt);
-- LIKE-prefix search: planner nie używa btree z default locale dla "prefix%" — C collation required
CREATE INDEX IF NOT EXISTS idx_parcels_teryt_c ON parcels (teryt COLLATE "C");
CREATE INDEX IF NOT EXISTS idx_parcels_voivodeship ON parcels (voivodeship_code);
CREATE INDEX IF NOT EXISTS idx_parcels_county ON parcels (county_code);
CREATE INDEX IF NOT EXISTS idx_parcels_commune ON parcels (commune_code);
CREATE INDEX IF NOT EXISTS idx_parcels_number ON parcels (number);
CREATE INDEX IF NOT EXISTS idx_parcels_area ON parcels (area_m2);
"""

COPY_COLUMNS: tuple[str, ...] = (
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
    "geometry",
    "centroid_lng",
    "centroid_lat",
    "bbox_min_lng",
    "bbox_min_lat",
    "bbox_max_lng",
    "bbox_max_lat",
    "fetched_at",
    "datasource",
)

COPY_CHUNK_BYTES = 1 << 20
PROGRESS_STEP = 500_000


class PgLoaderError(RuntimeError):
    """Raised when the PostGIS load cannot complete."""


def geometry_from_feature(feature: Mapping[str, Any]) -> BaseGeometry:
    import shapely

    geometry = feature.get("geometry")
    if not isinstance(geometry, Mapping):
        raise PgLoaderError(f"feature {feature.get('id')!r} has no geometry mapping")
    geojson = json.dumps(dict(geometry))
    return shapely.from_geojson(geojson, on_invalid="raise")


def row_from_feature(
    feature: Mapping[str, Any],
    *,
    fetched_at: str,
    datasource: str,
) -> tuple[Any, ...] | None:
    """COPY tuple from a staged canonical GeoJSON feature (mirrors sqlite_loader)."""
    if not isinstance(feature.get("geometry"), Mapping):
        return None
    geom = geometry_from_feature(feature)
    if geom.is_empty:
        return None
    props = feature["properties"]
    minx, miny, maxx, maxy = geom.bounds
    centroid = geom.centroid
    return (
        str(props.get("id") or feature.get("id") or ""),
        str(props.get("teryt") or props.get("id") or ""),
        str(props.get("number") or ""),
        str(props.get("voivodeship") or ""),
        str(props.get("voivodeship_code") or ""),
        str(props.get("county") or ""),
        str(props.get("county_code") or ""),
        str(props.get("commune") or ""),
        str(props.get("commune_code") or ""),
        str(props.get("region") or ""),
        _nullable_str(props.get("region_name")),
        _finite_or_zero(props.get("area_m2", 0.0)),
        _nullable_str(props.get("land_use")),
        geom.wkt,
        geom.wkt,
        float(centroid.x),
        float(centroid.y),
        float(minx),
        float(miny),
        float(maxx),
        float(maxy),
        fetched_at,
        datasource,
    )


def _nullable_str(value: Any) -> str | None:
    return None if value is None else str(value)


def _finite_or_zero(value: Any) -> float:
    try:
        area = float(value)
    except (TypeError, ValueError):
        return 0.0
    if area != area or area in (float("inf"), float("-inf")):  # noqa: PLR0124 — NaN check
        return 0.0
    return area


def copy_line(row: Sequence[Any]) -> bytes:
    """Encode one COPY text row (tab-delimited, \\N for NULL)."""
    parts: list[str] = []
    for value in row:
        if value is None:
            parts.append("\\N")
        else:
            text = str(value)
            parts.append(text.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n"))
    return ("\t".join(parts) + "\n").encode()


def _fmt_rate(rows: int, seconds: float) -> str:
    if seconds <= 0:
        return "n/a"
    return f"{rows / seconds:,.0f} rows/s"


class ProgressMeter:
    """Counts COPY rows; logs rate/ETA into the container log."""

    def __init__(self, expected_rows: int | None = None) -> None:
        self.count = 0
        self._started: float | None = None
        self._expected = expected_rows

    async def wrap(self, records: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
        batch: list[bytes] = []
        size = 0
        self._started = time.monotonic()
        async for line in records:
            self.count += 1
            batch.append(line)
            size += len(line)
            if self.count % PROGRESS_STEP == 0:
                self._log_progress()
            if size >= COPY_CHUNK_BYTES:
                yield b"".join(batch)
                batch.clear()
                size = 0
        if batch:
            yield b"".join(batch)
        elapsed = time.monotonic() - (self._started or time.monotonic())
        logger.info(
            "pg_loader_copy_rows",
            rows=self.count,
            seconds=int(elapsed),
            rate=_fmt_rate(self.count, elapsed),
        )

    def _log_progress(self) -> None:
        elapsed = time.monotonic() - (self._started or time.monotonic())
        payload: dict[str, Any] = {
            "rows": self.count,
            "seconds": int(elapsed),
            "rate": _fmt_rate(self.count, elapsed),
        }
        if self._expected and self._expected > 0 and self.count > 0:
            payload["pct"] = round(min(100.0, 100.0 * self.count / self._expected), 1)
            payload["eta_min"] = int((self._expected - self.count) * elapsed / self.count // 60)
        logger.info("pg_loader_progress", **payload)


async def iter_copy_lines(
    shard_paths: Sequence[Path],
    *,
    expected_rows: int | None,
    fetched_at: str,
    datasource: str,
) -> AsyncIterator[bytes]:
    """Async generator: staged gzip shards -> encoded COPY lines."""
    for shard in shard_paths:
        with gzip.open(shard, "rt", encoding="utf-8") as fh:
            read = 0
            for raw_line in fh:
                line = raw_line.strip()
                if not line:
                    continue
                read += 1
                row = row_from_feature(
                    json.loads(line), fetched_at=fetched_at, datasource=datasource
                )
                if row is not None:
                    yield copy_line(row)
            logger.info(
                "pg_loader_shard_streamed",
                shard=shard.name,
                features=read,
                expected_total=expected_rows,
            )


async def _set_sync_meta(conn: asyncpg.Connection, key: str, value: str, at_iso: str) -> None:
    await conn.execute(
        """
        INSERT INTO sync_meta (key, value, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
        """,
        key,
        value,
        at_iso,
    )


async def load_from_shards(
    shard_paths: Sequence[Path],
    *,
    dsn: str,
    datasource: str = "geoportal-parquet-kraj",
    etag: str | None = None,
    expected_rows: int | None = None,
    create_indexes: bool = True,
    index_only: bool = False,
) -> int:
    """Stream staged shards into the PostGIS parcels table; returns copied rows.

    Parallel workers pass ``create_indexes=False``; the coordinator runs
    ``index_only=True`` (empty shard list) once after all workers finish.
    """
    if not shard_paths and not index_only:
        raise PgLoaderError("no shard files provided")

    import asyncpg

    pool: asyncpg.Pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=2)
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    meter = ProgressMeter(expected_rows=expected_rows)
    try:
        async with pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)
        if not index_only:
            async with pool.acquire() as conn:
                lines = iter_copy_lines(
                    shard_paths,
                    expected_rows=expected_rows,
                    fetched_at=now_iso,
                    datasource=datasource,
                )
                status = await conn.copy_to_table(
                    "parcels",
                    columns=list(COPY_COLUMNS),
                    source=meter.wrap(lines),
                    format="text",
                )
                logger.info("pg_loader_copy_status", status=str(status))
        copied = meter.count
        async with pool.acquire() as conn:
            if create_indexes:
                await conn.execute(INDEXES_SQL)
                await conn.execute("ANALYZE parcels")
            table_count = await conn.fetchval("SELECT count(*) FROM parcels")
            if etag:
                await _set_sync_meta(conn, "egib_etag", etag, now_iso)
                await _set_sync_meta(conn, "last_sync", now_iso, now_iso)
        logger.info("pg_load_done", copied=copied, table_count=table_count, index_only=index_only)
        return copied
    finally:
        await pool.close()
