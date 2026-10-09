from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SyncStatus = Literal["running", "success", "error", "unknown"]


class SyncTriggerResponse(BaseModel):
    status: SyncStatus = "running"
    started_at: str
    message: str


class SyncStatusResponse(BaseModel):
    status: SyncStatus
    running: bool
    started_at: str | None = None
    finished_at: str | None = None
    last_sync: str | None = None
    error: str | None = None


class SyncConflictResponse(BaseModel):
    error: str
    code: str
    details: dict[str, object] = {}


__all__ = [
    "SyncConflictResponse",
    "SyncStatus",
    "SyncStatusResponse",
    "SyncTriggerResponse",
]
