"""Pytest fixtures shared by the backend test suite.

Provides:
- ``sample_db_path``: path to a fresh per-test SQLite copy of
  ``tests/fixtures/parcels_sample.sqlite``.
- ``sample_db``: an opened :class:`app.core.db.Database` bound to the copy.
- ``sample_pmtiles_path``: a tiny synthetic PMTiles-like binary that is
  enough to exercise HTTP Range handling.
- ``settings``: per-test :class:`app.core.config.Settings` pointing at the
  fixtures.
- ``client``: an ``httpx.AsyncClient`` wired to a freshly built
  FastAPI app using the fixture paths.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from app.core.config import Settings
from app.core.db import Database
from app.main import create_app
from httpx import ASGITransport, AsyncClient

if TYPE_CHECKING:
    from collections.abc import Iterator

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
SAMPLE_DB_SOURCE = FIXTURES_DIR / "parcels_sample.sqlite"
SAMPLE_PMTILES_SOURCE = FIXTURES_DIR / "poland_sample.pmtiles"


def _ensure_sample_db() -> Path:
    if not SAMPLE_DB_SOURCE.exists():
        from tests.fixtures.generate_sample import main as generate_main

        generate_main()
    return SAMPLE_DB_SOURCE


def _ensure_sample_pmtiles() -> Path:
    if not SAMPLE_PMTILES_SOURCE.exists():
        payload = bytes(range(256)) * 64  # 16 KiB synthetic blob
        SAMPLE_PMTILES_SOURCE.write_bytes(payload)
    return SAMPLE_PMTILES_SOURCE


@pytest.fixture(scope="session")
def sample_db_source() -> Path:
    return _ensure_sample_db()


@pytest.fixture(scope="session")
def sample_pmtiles_source() -> Path:
    return _ensure_sample_pmtiles()


@pytest.fixture
def tmp_dir() -> Iterator[Path]:
    with tempfile.TemporaryDirectory(prefix="wycinka-test-") as directory:
        yield Path(directory)


@pytest.fixture
def sample_db_path(sample_db_source: Path, tmp_dir: Path) -> Path:
    target = tmp_dir / "parcels.sqlite"
    shutil.copy2(sample_db_source, target)
    return target


@pytest.fixture
def sample_pmtiles_path(sample_pmtiles_source: Path, tmp_dir: Path) -> Path:
    target = tmp_dir / "dzialki.pmtiles"
    shutil.copy2(sample_pmtiles_source, target)
    return target


@pytest.fixture
def settings(sample_db_path: Path, sample_pmtiles_path: Path) -> Settings:
    return Settings(
        api_version="1.0.0",
        debug=True,
        db_path=sample_db_path,
        pmtiles_path=sample_pmtiles_path,
        cors_allow_origins="*",
    )


@pytest_asyncio.fixture
async def sample_db(sample_db_path: Path):
    db = Database.open(sample_db_path)
    try:
        yield db
    finally:
        await db.close()


@pytest_asyncio.fixture
async def client(settings: Settings):
    app = create_app(settings)
    transport = ASGITransport(app=app)
    async with (
        AsyncClient(transport=transport, base_url="http://testserver") as ac,
        app.router.lifespan_context(app),
    ):
        yield ac
