from __future__ import annotations

import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Request

from ..models.parcel import VersionResponse
from ..services.parcel_service import sqlite_supports_rtree

if TYPE_CHECKING:
    from ..core.storage import ParcelStorage

router = APIRouter()

_START_TIME = time.monotonic()


def _uptime_seconds() -> float:
    return time.monotonic() - _START_TIME


def _file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _etag_for(path: Path) -> str | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    return f"{int(stat.st_mtime)}-{stat.st_size}"


async def _ready_flags(storage: Any) -> tuple[bool, bool]:
    ready = await storage.ready()
    if ready:
        has_data = await storage.has_data()
    else:
        has_data = False
    return ready, has_data


async def _collect_health(request: Request) -> dict[str, Any]:
    settings = request.app.state.settings
    storage: ParcelStorage = request.app.state.db

    backend = getattr(storage, "backend", "sqlite")
    _ready, db_available = await _ready_flags(storage)
    db_path: str | None = None
    db_size: int | None = None
    db_path_exists: bool | None = None
    if backend == "sqlite":
        db_path = str(storage.path)  # type: ignore[attr-defined]
        db_size = _file_size(Path(db_path))
        db_path_exists = Path(db_path).exists()

    pmtiles_path: Path = settings.pmtiles_path_resolved
    pmtiles_loaded = pmtiles_path.exists() and pmtiles_path.stat().st_size > 0
    pmtiles_size = _file_size(pmtiles_path)

    last_sync: str | None = None
    if db_available:
        try:
            last_sync = await storage.get_sync_meta("last_sync")
        except (OSError, Exception):
            last_sync = None

    if db_available and pmtiles_loaded:
        status = "ok"
    elif db_available or pmtiles_loaded:
        status = "degraded"
    else:
        status = "down"

    return {
        "status": status,
        "version": settings.api_version,
        "uptime_seconds": int(_uptime_seconds()),
        "db_loaded": db_available,
        "db_backend": backend,
        "pmtiles_loaded": pmtiles_loaded,
        "data_freshness": last_sync,
        "db_path": db_path,
        "db_size_bytes": db_size,
        "db_path_exists": db_path_exists,
        "pmtiles_size_bytes": pmtiles_size,
        "rtree_available": sqlite_supports_rtree(),
        "cors_origins": settings.cors_origins_list,
    }


@router.get("/health")
async def health_endpoint(request: Request) -> dict[str, Any]:
    return await _collect_health(request)


@router.get("/api/v1/version", response_model=VersionResponse)
async def version_endpoint(request: Request) -> VersionResponse:
    settings = request.app.state.settings
    storage: ParcelStorage = request.app.state.db

    last_sync: str | None = None
    etag: str | None = None

    try:
        if await storage.ready():
            try:
                last_sync = await storage.get_sync_meta("last_sync")
            except (OSError, Exception):
                last_sync = None
            try:
                etag = await storage.get_sync_meta("egib_etag")
            except (OSError, Exception):
                etag = None
    except (OSError, Exception):
        last_sync = None
    pmtiles_path = settings.pmtiles_path_resolved
    if etag is None:
        etag = _etag_for(pmtiles_path)

    data_date = last_sync.split("T", 1)[0] if last_sync else None

    return VersionResponse(
        api=settings.api_version,
        data=data_date,
        egib_source="geoportal.gov.pl",
        etag=etag,
    )


__all__ = ["_collect_health", "router"]
