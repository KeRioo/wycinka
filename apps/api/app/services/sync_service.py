from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from ..core.logging import get_logger

if TYPE_CHECKING:
    from ..core.db import Database

logger = get_logger(__name__)

STATUS_RUNNING = "running"
STATUS_SUCCESS = "success"
STATUS_ERROR = "error"

META_STATUS = "sync_status"
META_STARTED_AT = "sync_started_at"
META_FINISHED_AT = "sync_finished_at"
META_ERROR = "sync_error"
META_LAST_SYNC = "last_sync"


class SyncAlreadyRunningError(Exception):
    """Raised when a sync is triggered while another one is in progress."""


class SyncNotConfiguredError(Exception):
    """Raised when no sync command is configured for the backend."""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class SyncService:
    """Triggers the EGiB sync pipeline asynchronously and reports its status.

    The actual data import is done by the ETL package
    (``scripts/sync-egib``). The backend runs it as an external command
    (``settings.sync_command``) so the two components stay decoupled.
    """

    def __init__(self, database: Database, command: str) -> None:
        self._db = database
        self._command = command.strip()
        self._running = False
        self._task: asyncio.Task[None] | None = None

    @property
    def is_running(self) -> bool:
        return self._running

    async def trigger(self) -> dict[str, object]:
        """Start a sync in the background and return the initial status."""
        if self._running or await self._meta_status() == STATUS_RUNNING:
            raise SyncAlreadyRunningError("A sync is already in progress")
        if not self._command:
            raise SyncNotConfiguredError("No sync command configured")

        started_at = _now_iso()
        self._running = True
        await self._db.set_sync_meta(META_STATUS, STATUS_RUNNING)
        await self._db.set_sync_meta(META_STARTED_AT, started_at)
        await self._db.set_sync_meta(META_ERROR, "")

        self._task = asyncio.create_task(self._run(), name="egib-sync")
        logger.info("sync.started", command=self._command)
        return {
            "status": STATUS_RUNNING,
            "started_at": started_at,
            "message": "Sync started",
        }

    async def _run(self) -> None:
        try:
            proc = await asyncio.create_subprocess_shell(
                self._command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stderr_bytes = b""
            try:
                _, stderr_bytes = await proc.communicate()
            finally:
                exit_code = proc.returncode
                elapsed = _now_iso()
                if exit_code == 0:
                    status, error = STATUS_SUCCESS, ""
                else:
                    status = STATUS_ERROR
                    error = _error_message(exit_code, stderr_bytes)
                await self._db.set_sync_meta(META_STATUS, status)
                await self._db.set_sync_meta(META_FINISHED_AT, elapsed)
                await self._db.set_sync_meta(META_ERROR, error)
                if status == STATUS_SUCCESS:
                    await self._db.set_sync_meta(META_LAST_SYNC, elapsed)
                logger.info("sync.finished", status=status, exit_code=exit_code)
        except FileNotFoundError:
            await self._finish_with_error(f"Sync command not found: {self._command}")
        except (OSError, asyncio.CancelledError):
            await self._finish_with_error("Sync was cancelled or failed to start")
        finally:
            self._running = False

    async def _finish_with_error(self, message: str) -> None:
        await self._db.set_sync_meta(META_STATUS, STATUS_ERROR)
        await self._db.set_sync_meta(META_FINISHED_AT, _now_iso())
        await self._db.set_sync_meta(META_ERROR, message)
        logger.error("sync.failed", error=message)

    async def status(self) -> dict[str, object]:
        running = self.is_running or await self._meta_status() == STATUS_RUNNING
        error = await self._db.get_sync_meta(META_ERROR)
        return {
            "status": await self._meta_status(),
            "running": running,
            "started_at": await self._db.get_sync_meta(META_STARTED_AT),
            "finished_at": await self._db.get_sync_meta(META_FINISHED_AT),
            "last_sync": await self._db.get_sync_meta(META_LAST_SYNC),
            "error": error or None,
        }

    async def wait(self) -> None:
        """Wait for the background task to finish (used in tests)."""
        task = self._task
        if task is not None:
            await task

    async def _meta_status(self) -> str:
        value = await self._db.get_sync_meta(META_STATUS)
        return value or "unknown"


def _to_text(raw: bytes) -> str:
    return raw.decode("utf-8", errors="replace").strip()


def _error_message(exit_code: int, stderr: bytes) -> str:
    text = _to_text(stderr)
    return text or f"Sync command failed with exit code {exit_code}"


__all__ = [
    "META_ERROR",
    "META_FINISHED_AT",
    "META_LAST_SYNC",
    "META_STARTED_AT",
    "META_STATUS",
    "STATUS_ERROR",
    "STATUS_RUNNING",
    "STATUS_SUCCESS",
    "SyncAlreadyRunningError",
    "SyncNotConfiguredError",
    "SyncService",
]
