"""PostGIS-backed parcel storage (asyncpg pool + PostGIS spatial queries)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog

from .storage import ParcelStorage

if TYPE_CHECKING:
    from collections.abc import Sequence

    import asyncpg

logger = structlog.get_logger(__name__)

_FIELDS = (
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
)

_SELECT_COLUMNS = "p." + ", p.".join(_FIELDS)

_SCHEMA_SQL = """
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
  geometry geometry(Geometry, 4326) GENERATED ALWAYS AS (
    ST_GeomFromText(geom_wkt, 4326)
  ) STORED,
  centroid_lng double precision NOT NULL,
  centroid_lat double precision NOT NULL,
  bbox_min_lng double precision NOT NULL,
  bbox_min_lat double precision NOT NULL,
  bbox_max_lng double precision NOT NULL,
  bbox_max_lat double precision NOT NULL,
  fetched_at text NOT NULL,
  datasource text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_parcels_geometry_gist ON parcels USING gist (geometry);
CREATE INDEX IF NOT EXISTS idx_parcels_teryt ON parcels (teryt);
CREATE INDEX IF NOT EXISTS idx_parcels_voivodeship ON parcels (voivodeship_code);
CREATE INDEX IF NOT EXISTS idx_parcels_county ON parcels (county_code);
CREATE INDEX IF NOT EXISTS idx_parcels_commune ON parcels (commune_code);
CREATE INDEX IF NOT EXISTS idx_parcels_number ON parcels (number);
CREATE INDEX IF NOT EXISTS idx_parcels_area ON parcels (area_m2);
CREATE TABLE IF NOT EXISTS sync_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at text NOT NULL
);
"""

_POINT_CANDIDATE_LIMIT = 40

_POINT_CANDIDATES_SQL = (
    f"SELECT {_SELECT_COLUMNS} FROM parcels p "
    "WHERE p.geometry && ST_SetSRID(ST_MakePoint($2, $1), 4326) "
    "ORDER BY p.area_m2 ASC LIMIT $3"
)

_SELECT_BY_TERYT_SQL = f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt = $1"

_SEARCH_PREFIX_SQL = (
    f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt LIKE $1 ORDER BY p.teryt LIMIT $2"
)


def _to_os_error(exc: Exception, *, context: str) -> OSError:
    logger.warning("pg_error", context=context, error=str(exc))
    error = OSError(f"postgres unavailable ({context}): {exc}")
    raise error from exc


def _context_from_sql(sql: str) -> str:
    if "MakePoint" in sql:
        return "get_point_candidates"
    if "LIKE $1" in sql:
        return "search_prefix"
    if "ANY($1)" in sql:
        return "get_many_by_teryt"
    return "get_by_teryt"


class PostgresDatabase(ParcelStorage):
    """asyncpg pool implementing the ParcelStorage protocol (PostGIS backend)."""

    def __init__(self, dsn: str, *, min_size: int = 1, max_size: int = 4) -> None:
        self._dsn = dsn
        self._min_size = min_size
        self._max_size = max_size
        self._pool: asyncpg.Pool | None = None

    @property
    def backend(self) -> str:
        return "postgres"

    async def connect(self) -> asyncpg.Pool:
        if self._pool is None:
            import asyncpg

            self._pool = await asyncpg.create_pool(
                dsn=self._dsn, min_size=self._min_size, max_size=self._max_size
            )
            logger.info("pg_pool.created", min_size=self._min_size, max_size=self._max_size)
        return self._pool

    async def init_schema(self) -> None:
        pool = await self.connect()
        async with pool.acquire() as conn:
            await conn.execute(_SCHEMA_SQL)

    async def is_available(self) -> bool:
        try:
            pool = await self.connect()
        except OSError:
            return False
        try:
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
        except Exception:
            return False
        return True

    async def ready(self) -> bool:
        try:
            pool = await self.connect()
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1")
        except OSError:
            return False
        except Exception:
            return False
        return True

    async def has_data(self) -> bool:
        try:
            pool = await self.connect()
            async with pool.acquire() as conn:
                await conn.execute("SELECT 1 FROM parcels LIMIT 1")
        except OSError:
            return False
        except Exception:
            return False
        return True

    async def _fetch(self, sql: str, *args: Any) -> list[Any]:
        context = _context_from_sql(sql)
        try:
            pool = await self.connect()
            async with pool.acquire() as conn:
                return list(await conn.fetch(sql, *args))
        except OSError as exc:
            raise _to_os_error(exc, context=context) from exc
        except Exception as exc:
            raise _to_os_error(exc, context=context) from exc

    async def get_point_candidates(self, lat: float, lng: float) -> list[Any]:
        return await self._fetch(_POINT_CANDIDATES_SQL, lat, lng, _POINT_CANDIDATE_LIMIT)

    async def get_by_teryt(self, teryt: str) -> Any | None:
        rows = await self._fetch(_SELECT_BY_TERYT_SQL, teryt)
        return rows[0] if rows else None

    async def get_many_by_teryt(self, teryt_list: Sequence[str]) -> list[Any]:
        if not teryt_list:
            return []
        sql = f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt = ANY($1)"
        return await self._fetch(sql, list(teryt_list))

    async def search_teryt_prefix(self, prefix: str, limit: int) -> list[Any]:
        return await self._fetch(_SEARCH_PREFIX_SQL, f"{prefix}%", limit)

    async def get_sync_meta(self, key: str) -> str | None:
        try:
            pool = await self.connect()
            async with pool.acquire() as conn:
                value = await conn.fetchval("SELECT value FROM sync_meta WHERE key = $1", key)
        except OSError:
            return None
        except Exception as exc:
            logger.warning("pg_error", context="get_sync_meta", error=str(exc))
            return None
        return None if value is None else str(value)

    async def set_sync_meta(self, key: str, value: str) -> None:
        from datetime import UTC, datetime

        now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        try:
            pool = await self.connect()
            async with pool.acquire() as conn:
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
                    now,
                )
        except OSError as exc:
            raise _to_os_error(exc, context="set_sync_meta") from exc
        except Exception as exc:
            raise _to_os_error(exc, context="set_sync_meta") from exc

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
