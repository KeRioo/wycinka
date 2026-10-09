from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .api import api_router
from .core.config import Settings, get_settings
from .core.db import Database
from .core.logging import configure_logging, get_logger
from .services.parcel_service import ParcelService
from .services.sync_service import SyncService

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    db: Database = Database.open(settings.db_path_resolved)
    app.state.db = db
    app.state.parcel_service = ParcelService(db)
    app.state.sync_service = SyncService(db, settings.sync_command)

    start = time.monotonic()
    db_available = await db.is_available()
    pmtiles_path = settings.pmtiles_path_resolved
    pmtiles_present = pmtiles_path.exists() and pmtiles_path.stat().st_size > 0

    if db_available:
        logger.info("database.ready", path=str(db.path))
    else:
        logger.warning(
            "database.missing",
            path=str(db.path),
            hint="Run ETL sync to populate data/parcels.sqlite",
        )

    if pmtiles_present:
        logger.info(
            "pmtiles.ready",
            path=str(pmtiles_path),
            size_bytes=pmtiles_path.stat().st_size,
        )
    else:
        logger.warning(
            "pmtiles.missing",
            path=str(pmtiles_path),
            hint="Generate PMTiles with tippecanoe (see scripts/sync-egib)",
        )

    logger.info(
        "startup.complete",
        version=__version__,
        duration_ms=int((time.monotonic() - start) * 1000),
    )

    try:
        yield
    finally:
        logger.info("shutdown.begin")
        await db.close()
        logger.info("shutdown.complete")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    app = FastAPI(
        title="wycinka.app API",
        version=__version__,
        description="Backend for wycinka.app — EGiB parcel data, self-hosted.",
        docs_url="/docs",
        redoc_url=None,
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.start_time = time.time()

    cors_origins: list[str] = settings.cors_origins_list
    allow_credentials = "*" not in cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=allow_credentials,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Content-Range", "Content-Length", "ETag", "Accept-Ranges"],
    )

    app.include_router(api_router)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and {"error", "code"} <= detail.keys():
            payload = detail
        else:
            payload = {
                "error": str(detail) if detail else "HTTP error",
                "code": _http_code_to_error_code(exc.status_code),
                "details": {},
            }
        response = JSONResponse(status_code=exc.status_code, content=payload)
        response.headers["Access-Control-Allow-Origin"] = (
            "*" if not cors_origins or cors_origins == ["*"] else cors_origins[0]
        )
        return response

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "unhandled.exception",
            path=str(request.url.path),
            method=request.method,
            exc_type=type(exc).__name__,
            exc_msg=str(exc),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "code": "INTERNAL_ERROR",
                "details": {"type": type(exc).__name__},
            },
        )

    return app


def _http_code_to_error_code(status_code: int) -> str:
    mapping: dict[int, str] = {
        400: "BAD_REQUEST",
        404: "PARCEL_NOT_FOUND",
        416: "BAD_REQUEST",
        422: "INVALID_TERYT",
        429: "RATE_LIMITED",
        500: "INTERNAL_ERROR",
        503: "DB_UNAVAILABLE",
        504: "GATEWAY_TIMEOUT",
    }
    return mapping.get(status_code, "INTERNAL_ERROR")


app = create_app()


def get_application() -> FastAPI:
    """Compatibility hook for ASGI servers (used by uvicorn entry points)."""
    return app


__all__ = ["app", "create_app", "get_application"]
