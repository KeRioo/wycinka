from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import aiosqlite

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

PARCELS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  teryt TEXT NOT NULL UNIQUE,
  number TEXT NOT NULL,
  voivodeship TEXT NOT NULL,
  voivodeship_code TEXT NOT NULL,
  county TEXT NOT NULL,
  county_code TEXT NOT NULL,
  commune TEXT NOT NULL,
  commune_code TEXT NOT NULL,
  region TEXT NOT NULL,
  region_name TEXT,
  area_m2 REAL NOT NULL,
  land_use TEXT,
  geom_wkt TEXT NOT NULL,
  centroid_lng REAL NOT NULL,
  centroid_lat REAL NOT NULL,
  bbox_min_lng REAL NOT NULL,
  bbox_min_lat REAL NOT NULL,
  bbox_max_lng REAL NOT NULL,
  bbox_max_lat REAL NOT NULL,
  fetched_at TEXT NOT NULL,
  datasource TEXT NOT NULL
);
"""

PARCELS_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS idx_parcels_teryt ON parcels(teryt);
CREATE INDEX IF NOT EXISTS idx_parcels_voivodeship ON parcels(voivodeship_code);
CREATE INDEX IF NOT EXISTS idx_parcels_county ON parcels(county_code);
CREATE INDEX IF NOT EXISTS idx_parcels_commune ON parcels(commune_code);
CREATE INDEX IF NOT EXISTS idx_parcels_number ON parcels(number);
"""

RTREE_SCHEMA_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS parcels_rtree USING rtree(
  id INTEGER PRIMARY KEY,
  min_lng, max_lng,
  min_lat, max_lat
);

CREATE TABLE IF NOT EXISTS parcels_rtree_map (
  parcel_id TEXT NOT NULL UNIQUE,
  rtree_id INTEGER NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_parcels_rtree_map_parcel
  ON parcels_rtree_map(parcel_id);
"""

RTREE_TRIGGERS_SQL = """
CREATE TRIGGER IF NOT EXISTS parcels_rtree_insert AFTER INSERT ON parcels
BEGIN
  INSERT INTO parcels_rtree (min_lng, max_lng, min_lat, max_lat)
  VALUES (
    NEW.bbox_min_lng, NEW.bbox_max_lng, NEW.bbox_min_lat, NEW.bbox_max_lat
  );
  INSERT INTO parcels_rtree_map (parcel_id, rtree_id)
  VALUES (NEW.id, last_insert_rowid());
END;

CREATE TRIGGER IF NOT EXISTS parcels_rtree_delete AFTER DELETE ON parcels
BEGIN
  DELETE FROM parcels_rtree_map WHERE parcel_id = OLD.id;
  DELETE FROM parcels_rtree WHERE id = (
    SELECT rtree_id FROM parcels_rtree_map WHERE parcel_id = OLD.id
  );
END;
"""

SYNC_META_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""

ALL_SCHEMA = (
    PARCELS_SCHEMA_SQL
    + PARCELS_INDEXES_SQL
    + RTREE_SCHEMA_SQL
    + RTREE_TRIGGERS_SQL
    + SYNC_META_SCHEMA_SQL
)


@dataclass(slots=True)
class Database:
    path: Path
    _lock: asyncio.Lock

    @classmethod
    def open(cls, path: Path) -> Database:
        return cls(path=Path(path), _lock=asyncio.Lock())

    async def connect(self) -> aiosqlite.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = await aiosqlite.connect(str(self.path))
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode = WAL")
        await conn.execute("PRAGMA foreign_keys = ON")
        return conn

    async def init_schema(self, conn: aiosqlite.Connection) -> None:
        await conn.executescript(ALL_SCHEMA)
        await conn.commit()

    @asynccontextmanager
    async def connection(self) -> AsyncIterator[aiosqlite.Connection]:
        conn = await self.connect()
        try:
            await self.init_schema(conn)
            yield conn
        finally:
            await conn.close()

    async def is_available(self) -> bool:
        try:
            async with self.connection() as conn:
                await conn.execute("SELECT 1")
            return True
        except (OSError, aiosqlite.Error):
            return False

    async def execute(
        self,
        sql: str,
        parameters: tuple[Any, ...] | dict[str, Any] = (),
        *,
        commit: bool = False,
    ) -> aiosqlite.Cursor:
        async with self.connection() as conn:
            cursor = await conn.execute(sql, parameters)
            if commit:
                await conn.commit()
            return cursor

    async def fetch_one(
        self,
        sql: str,
        parameters: tuple[Any, ...] | dict[str, Any] = (),
    ) -> aiosqlite.Row | None:
        async with self.connection() as conn:
            cursor = await conn.execute(sql, parameters)
            return await cursor.fetchone()

    async def fetch_all(
        self,
        sql: str,
        parameters: tuple[Any, ...] | dict[str, Any] = (),
    ) -> list[aiosqlite.Row]:
        async with self.connection() as conn:
            cursor = await conn.execute(sql, parameters)
            return list(await cursor.fetchall())

    async def executemany(
        self,
        sql: str,
        seq_of_parameters: list[tuple[Any, ...]],
    ) -> None:
        async with self.connection() as conn:
            await conn.executemany(sql, seq_of_parameters)
            await conn.commit()

    async def executescript(self, script: str) -> None:
        async with self.connection() as conn:
            await conn.executescript(script)
            await conn.commit()

    async def get_sync_meta(self, key: str) -> str | None:
        row = await self.fetch_one(
            "SELECT value FROM sync_meta WHERE key = ?",
            (key,),
        )
        return None if row is None else str(row["value"])

    async def set_sync_meta(self, key: str, value: str) -> None:
        async with self.connection() as conn:
            await conn.execute(
                """
                INSERT INTO sync_meta (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at
                """,
                (key, value, _now_iso()),
            )
            await conn.commit()

    async def close(self) -> None:
        return


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


async def is_rtree_available(conn: aiosqlite.Connection) -> bool:
    cursor = await conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='parcels_rtree'",
    )
    row = await cursor.fetchone()
    return row is not None
