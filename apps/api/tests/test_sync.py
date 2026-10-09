"""Tests for /api/v1/sync/trigger and /api/v1/sync/status endpoints."""

from __future__ import annotations

import asyncio
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from shutil import copy2
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from app.core.config import Settings
from app.main import create_app
from httpx import ASGITransport, AsyncClient

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from app.core.db import Database
    from fastapi import FastAPI

POLL_INTERVAL = 0.02
POLL_TIMEOUT = 10.0


class SyncEnv:
    """Test harness bound to a freshly built app with a tmp database."""

    def __init__(self, client: AsyncClient, app: FastAPI, tmp_dir: Path) -> None:
        self.client = client
        self.app = app
        self.tmp_dir = tmp_dir

    @property
    def db(self) -> Database:
        database: Database = self.app.state.db
        return database


@asynccontextmanager
async def _open_env(
    sync_command: str,
    *,
    db_path_override: Path | None = None,
) -> AsyncIterator[SyncEnv]:
    fixtures_dir = Path(__file__).resolve().parent / "fixtures"
    db_source = fixtures_dir / "parcels_sample.sqlite"
    if not db_source.exists():
        from tests.fixtures.generate_sample import main as generate_main

        generate_main()
    pmtiles_source = fixtures_dir / "poland_sample.pmtiles"
    if not pmtiles_source.exists():
        pmtiles_source.write_bytes(bytes(range(256)) * 64)

    with tempfile.TemporaryDirectory(prefix="wycinka-sync-") as directory:
        tmp_dir = Path(directory)
        db_path = db_path_override if db_path_override else tmp_dir / "sync.sqlite"
        if db_path_override is None:
            copy2(db_source, db_path)
        pmtiles_path = tmp_dir / "dzialki.pmtiles"
        copy2(pmtiles_source, pmtiles_path)

        settings = Settings(
            api_version="1.0.0",
            debug=True,
            db_path=db_path,
            pmtiles_path=pmtiles_path,
            cors_allow_origins="*",
            sync_command=sync_command,
        )
        app = create_app(settings)
        transport = ASGITransport(app=app)
        async with (
            AsyncClient(transport=transport, base_url="http://testserver") as client,
            app.router.lifespan_context(app),
        ):
            yield SyncEnv(client, app, tmp_dir)


@pytest.fixture(params=["echo ok"], ids=["happy-command"])
def sync_command(request: pytest.FixtureRequest) -> str:
    return str(request.param)


@pytest_asyncio.fixture
async def sync_env(sync_command: str) -> AsyncIterator[SyncEnv]:
    async with _open_env(sync_command) as env:
        yield env


async def _wait_until_finished(client: AsyncClient) -> dict[str, object]:
    loop = asyncio.get_running_loop()
    deadline = loop.time() + POLL_TIMEOUT
    while True:
        payload: dict[str, object] = (await client.get("/api/v1/sync/status")).json()
        if not payload.get("running"):
            return payload
        if loop.time() > deadline:
            pytest.fail("sync did not finish in time")
        await asyncio.sleep(POLL_INTERVAL)


# --- POST /api/v1/sync/trigger -------------------------------------------------


async def test_trigger_when_command_succeeds_then_started_and_finished(
    sync_env: SyncEnv,
) -> None:
    response = await sync_env.client.post("/api/v1/sync/trigger")
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "running"
    assert body["started_at"]

    final: dict[str, object] = await _wait_until_finished(sync_env.client)
    assert final["status"] == "success"
    assert final["running"] is False
    assert final["error"] is None
    assert final["last_sync"]
    assert final["finished_at"]


@pytest.mark.parametrize("sync_command", ["exit 3"], indirect=True)
async def test_trigger_when_command_fails_then_status_error(
    sync_env: SyncEnv,
) -> None:
    response = await sync_env.client.post("/api/v1/sync/trigger")
    assert response.status_code == 202

    final = await _wait_until_finished(sync_env.client)
    assert final["status"] == "error"
    assert final["running"] is False
    assert final["error"]
    assert final["finished_at"] is not None


@pytest.mark.parametrize("sync_command", ["wycinka-missing-cmd"], indirect=True)
async def test_trigger_when_command_not_found_then_error_status(
    sync_env: SyncEnv,
) -> None:
    await sync_env.client.post("/api/v1/sync/trigger")
    final = await _wait_until_finished(sync_env.client)
    assert final["status"] == "error"
    assert "not found" in str(final["error"])


@pytest.mark.parametrize("sync_command", [""], indirect=True)
async def test_trigger_when_not_configured_then_bad_request(
    sync_env: SyncEnv,
) -> None:
    response = await sync_env.client.post("/api/v1/sync/trigger")
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "SYNC_NOT_CONFIGURED"
    assert (await sync_env.client.post("/api/v1/sync/trigger")).status_code == 400


async def test_trigger_when_second_call_while_running_then_conflict() -> None:
    async with _open_env("sleep 0.4") as env:
        first = await env.client.post("/api/v1/sync/trigger")
        assert first.status_code == 202
        second = await env.client.post("/api/v1/sync/trigger")
        assert second.status_code == 409
        body = second.json()
        assert body["code"] == "SYNC_ALREADY_RUNNING"
        await _wait_until_finished(env.client)


# --- GET /api/v1/sync/status ---------------------------------------------------


async def test_status_when_never_synced_then_unknown(sync_env: SyncEnv) -> None:
    response = await sync_env.client.get("/api/v1/sync/status")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unknown"
    assert body["running"] is False
    assert body["finished_at"] is None
    assert body["error"] is None


async def test_status_when_sync_meta_written_then_reflected(sync_env: SyncEnv) -> None:
    await sync_env.db.set_sync_meta("sync_status", "success")
    await sync_env.db.set_sync_meta("last_sync", "2026-09-29T03:00:00Z")

    body = (await sync_env.client.get("/api/v1/sync/status")).json()
    assert body["status"] == "success"
    assert body["last_sync"] == "2026-09-29T03:00:00Z"
    assert body["running"] is False


async def test_status_when_db_unavailable_then_service_unavailable() -> None:
    with tempfile.TemporaryDirectory(prefix="wycinka-sync-") as directory:
        # a directory as db path makes every SQLite open fail (OperationalError)
        async with _open_env("echo ok", db_path_override=Path(directory)) as env:
            response = await env.client.get("/api/v1/sync/status")
            assert response.status_code == 503
            assert response.json()["code"] == "DB_UNAVAILABLE"


async def test_status_when_running_then_running_reported() -> None:
    async with _open_env("sleep 0.4") as env:
        await env.client.post("/api/v1/sync/trigger")
        body = (await env.client.get("/api/v1/sync/status")).json()
        assert body["status"] == "running"
        assert body["running"] is True
        assert body["started_at"] is not None
        await _wait_until_finished(env.client)
