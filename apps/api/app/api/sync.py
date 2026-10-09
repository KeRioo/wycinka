from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, HTTPException, Request

from ..models.sync import SyncStatusResponse, SyncTriggerResponse
from ..services.sync_service import (
    SyncAlreadyRunningError,
    SyncNotConfiguredError,
    SyncService,
)

router = APIRouter()


def _service(request: Request) -> SyncService:
    service: SyncService = request.app.state.sync_service
    return service


def _http_error(status_code: int, message: str, code: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"error": message, "code": code, "details": {}},
    )


@router.post("/sync/trigger", response_model=SyncTriggerResponse, status_code=202)
async def trigger_sync(request: Request) -> SyncTriggerResponse:
    """Start the EGiB sync pipeline in the background."""
    service = _service(request)
    try:
        result = await service.trigger()
    except SyncAlreadyRunningError as exc:
        raise _http_error(409, str(exc), "SYNC_ALREADY_RUNNING") from exc
    except SyncNotConfiguredError as exc:
        raise _http_error(400, str(exc), "SYNC_NOT_CONFIGURED") from exc
    except (OSError, aiosqlite.Error) as exc:
        raise _http_error(503, "Database is not available", "DB_UNAVAILABLE") from exc
    return SyncTriggerResponse.model_validate(result)


@router.get("/sync/status", response_model=SyncStatusResponse)
async def sync_status(request: Request) -> SyncStatusResponse:
    """Report the status of the last (or current) sync run."""
    service = _service(request)
    try:
        result = await service.status()
    except (OSError, aiosqlite.Error) as exc:
        raise _http_error(503, "Database is not available", "DB_UNAVAILABLE") from exc
    return SyncStatusResponse.model_validate(result)


__all__ = ["router"]
