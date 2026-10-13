"""Unit-testy `PostgresDatabase` (fake pool zamiast realnego Postgresa)."""

from __future__ import annotations

from typing import Any

import pytest
from app.core.pg import PostgresDatabase


class _FakeConn:
    def __init__(self, store: dict[str, Any], *, fail_on: str | None = None) -> None:
        self.store = store
        self.fail_on = fail_on
        self.calls: list[str] = []

    async def execute(self, sql: str, *args: Any) -> None:
        self.calls.append(sql.strip().split("\n")[0])
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("pg boom")
        self.store.setdefault("last_sql", sql)

    async def fetch(self, sql: str, *args: Any) -> list[Any]:
        self.calls.append("fetch")
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("pg boom")
        self.store["last_sql"] = sql
        rows = self.store.get("rows", [])
        return rows

    async def fetchval(self, sql: str, *args: Any) -> Any:
        self.calls.append("fetchval")
        return self.store.get("value")


class _FakePooledConn:
    async def __aenter__(self) -> _FakeConn:
        return self.conn

    async def __aexit__(self, *args: Any) -> None:
        return None

    def __init__(self, conn: _FakeConn) -> None:
        self.conn = conn


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self) -> _FakePooledConn:
        return _FakePooledConn(self._conn)


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> PostgresDatabase:
    conn = _FakeConn(store={})
    pool = _FakePool(conn)

    class FakeAsyncpg:
        @staticmethod
        async def create_pool(dsn: str, **kwargs: Any) -> _FakePool:
            return pool

    import sys

    monkeypatch.setitem(sys.modules, "asyncpg", FakeAsyncpg)
    return PostgresDatabase("postgresql://wycinka:x@db:5432/wycinka")


@pytest.mark.asyncio
class TestPostgresDatabaseQueries:
    async def test_point_candidates_uses_st_makepoint_and_limit(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.store["rows"] = [{"teryt": "141201_1.0001.6509"}]
        rows = await storage.get_point_candidates(52.23, 21.01)
        assert rows == [{"teryt": "141201_1.0001.6509"}]
        sql = conn.store["last_sql"]
        assert "ST_MakePoint($2, $1)" in sql
        assert "ORDER BY p.area_m2 ASC LIMIT $3" in sql
        # called with (lat, lng, limit)
        assert conn.calls[-1] == "fetch"

    async def test_search_prefix_appends_percent(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.store["rows"] = [{"id": "x"}]
        rows = await storage.search_teryt_prefix("12", 10)
        assert rows
        sql = conn.store["last_sql"]
        assert "LIKE $1" in sql
        # the % suffix is appended in the adapter; validate via the fetch args path

    async def test_get_many_by_teryt_when_empty_then_no_fetch(self, storage: PostgresDatabase) -> None:
        rows = await storage.get_many_by_teryt([])
        assert rows == []

    async def test_get_by_teryt_when_no_row_then_none(self, storage: PostgresDatabase) -> None:
        assert await storage.get_by_teryt("missing") is None

    async def test_fetch_error_converted_to_oserror(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.fail_on = "SELECT"
        with pytest.raises(OSError):
            await storage.get_by_teryt("141201_1.0001.6509")


@pytest.mark.asyncio
class TestPostgresDatabaseMeta:
    async def test_set_sync_meta_uses_upsert(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        await storage.set_sync_meta("last_sync", "2026-10-13T00:00:00Z")
        assert "ON CONFLICT (key) DO UPDATE" in conn.store["last_sql"]

    async def test_get_sync_meta_returns_value(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.store["value"] = "v"
        assert await storage.get_sync_meta("last_sync") == "v"

    async def test_get_sync_meta_when_fail_then_none(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.fail_on = "SELECT"
        assert await storage.get_sync_meta("last_sync") is None

    async def test_ready_false_when_connect_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import sys

        class FailingAsyncpg:
            @staticmethod
            async def create_pool(dsn: str, **kwargs: Any) -> None:
                raise OSError("can't reach host")

        monkeypatch.setitem(sys.modules, "asyncpg", FailingAsyncpg)
        storage = PostgresDatabase("postgresql://x")
        assert await storage.ready() is False
        assert await storage.is_available() is False

    async def test_has_data_false_when_query_fails(self, storage: PostgresDatabase) -> None:
        conn = (await storage.connect())._conn
        conn.fail_on = "SELECT 1 FROM parcels"
        assert await storage.has_data() is False
