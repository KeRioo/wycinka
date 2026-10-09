"""ETL pipeline orchestrator.

Runs the four ETL stages in order:

1. **Download** — powiat GPKG files from geoportal.gov.pl (skip-able).
2. **Merge** — concatenate GPKGs into one file (skip-able).
3. **PMTiles** — generate a single PMTiles archive via tippecanoe (skip-able).
4. **SQLite** — load parcels into SQLite + R-tree, update sync_meta (skip-able).

Each stage writes atomically (``.tmp`` -> ``rename``); the previous artifact
is copied to a timestamped backup before a stage overwrites it. On a stage
failure the original artifact is preserved from backup and the function
returns a partial :class:`PipelineResult` with the error in ``errors``.

If ``dry_run=True`` no files are written — useful for CI smoke tests and
for validating ``Settings`` / ``powiat_prefix`` wiring before a real run.
"""

from __future__ import annotations

import asyncio
import json
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from egib_sync.config import Settings
from egib_sync.downloader import (
    Powiat,
    download_all_powiaty,
    filter_powiaty,
    load_powiat_list,
    summarize_results,
)
from egib_sync.logging import get_logger
from egib_sync.merger import merge_gpkg_files
from egib_sync.pmtiles_gen import generate_pmtiles
from egib_sync.sqlite_loader import (
    load_parcels_from_gpkg,
    parcels_count,
    update_sync_meta,
)

logger = get_logger(__name__)


class PipelineError(RuntimeError):
    """Raised when a pipeline stage fails irrecoverably."""


@dataclass(frozen=True, slots=True)
class PipelineResult:
    """Outcome of :func:`run_pipeline`."""

    pmtiles_path: Path
    sqlite_path: Path
    merged_path: Path
    raw_files: list[Path]
    parcels_count: int
    started_at: datetime
    finished_at: datetime
    errors: list[str] = field(default_factory=list)
    download_summary: dict[str, Any] = field(default_factory=dict)
    etag: str = ""

    @property
    def success(self) -> bool:
        return not self.errors


_BACKUP_PREFIX: Final = "ts"


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _format_backup_ts(when: datetime | None = None) -> str:
    when = when or _utc_now()
    return when.strftime("%Y%m%dT%H%M%SZ")


def _backup_path(base_dir: Path, stamp: str, original: Path) -> Path:
    """Return a backup path inside ``base_dir/stamp/`` mirroring ``original``."""
    return base_dir / stamp / original.name


def backup_existing(target: Path, *, backup_dir: Path, stamp: str) -> Path | None:
    """Copy ``target`` to ``backup_dir/stamp/<name>`` if it exists.

    Returns the backup path, or None if the source did not exist.
    """
    if not target.exists():
        return None
    dest = _backup_path(backup_dir, stamp, target)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(target, dest)
    logger.info("backup_created", source=str(target), backup=str(dest))
    return dest


def restore_backup(backup: Path, target: Path) -> bool:
    """Restore ``target`` from a backup file. Returns True if restored."""
    if not backup.exists():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(backup, target)
    logger.info("backup_restored", backup=str(backup), target=str(target))
    return True


def cleanup_old_backups(backup_dir: Path, *, keep: int) -> int:
    """Remove all but the newest ``keep`` timestamp directories. Returns count removed."""
    if not backup_dir.exists():
        return 0
    stamp_dirs = [p for p in backup_dir.iterdir() if p.is_dir()]
    stamp_dirs.sort(key=lambda p: p.name, reverse=True)
    removed = 0
    for old in stamp_dirs[keep:]:
        try:
            shutil.rmtree(old)
            removed += 1
        except OSError as exc:
            logger.warning("backup_cleanup_failed", path=str(old), error=str(exc))
    if removed:
        logger.info("backups_cleaned", dir=str(backup_dir), kept=keep, removed=removed)
    return removed


def _etag_from_powiat_list(powiats: list[Powiat]) -> str:
    """Derive a synthetic ETag from the powiat list for ``sync_meta``."""
    h = "|".join(p.etag or "" for p in powiats)
    return h[:128] or "no-etag"


async def _run_download(
    settings: Settings,
    *,
    powiat_prefix: str | None,
    powiat_list_source: str | Path | None,
    dry_run: bool,
) -> tuple[list[Path], dict[str, Any], str]:
    """Run download stage. Returns (raw_files, summary, etag)."""
    if dry_run:
        logger.info("download_skipped_dry_run")
        return [], {"skipped": True, "reason": "dry_run"}, "dry-run"

    if powiat_list_source is None and settings.sources.use_wfs:
        from egib_sync.wfs import (
            download_powiat_wfs,
            resolve_powiat_name,
        )

        if not powiat_prefix or len(str(powiat_prefix)) < 4:
            raise PipelineError(
                "WFS download mode requires --powiat <TERYT> (4+ digits, e.g. 1417 "
                "for powiat otwocki); no explicit powiat list source was given"
            )

        teryt = str(powiat_prefix)
        settings.ensure_dirs()
        result = await download_powiat_wfs(
            teryt,
            settings.raw_dir,
            name=resolve_powiat_name(teryt),
            settings=settings.download,
            wfs_url=settings.sources.wfs_url,
            wfs_layer=settings.sources.wfs_layer,
            page_size=settings.sources.wfs_page_size,
            max_parcels=settings.download.max_parcels,
            max_result_bytes=settings.sources.raw_bytes_budget,
        )
        if not result.success:
            raise PipelineError(f"wfs download failed for {teryt}: {result.error}")
        summary: dict[str, Any] = {
            "mode": "wfs-zbiorcza",
            "teryt": teryt,
            "name": result.name,
            "parcels": result.parcels,
            "pages": result.pages,
            "hits": result.hits,
            "gpkg_bytes": result.path.stat().st_size if result.path.exists() else 0,
            "prefix": teryt,
        }
        logger.info("download_summary", **summary)
        return [result.path], summary, f"wfs|{teryt}|{result.hits}"

    powiats = await load_powiat_list(powiat_list_source)
    powiats = filter_powiaty(powiats, powiat_prefix)
    if not powiats:
        raise PipelineError(f"no powiats matched prefix={powiat_prefix!r}; aborting download stage")

    settings.ensure_dirs()
    results = await download_all_powiaty(powiats, settings.raw_dir)
    summary = summarize_results(results)
    summary["prefix"] = powiat_prefix
    logger.info("download_summary", **summary)

    raw_files = [r.path for r in results if r.success and r.path.exists()]
    if not raw_files:
        raise PipelineError(f"all downloads failed ({summary.get('failed', 0)} failures); aborting")

    return raw_files, summary, _etag_from_powiat_list(powiats)


def _run_merge(
    settings: Settings,
    raw_files: list[Path],
    *,
    dry_run: bool,
    stamp: str,
) -> Path:
    """Run merge stage. Returns merged GPKG path."""
    if dry_run:
        logger.info("merge_skipped_dry_run")
        return settings.merged_path

    if not raw_files:
        raise PipelineError("merge stage: no raw files provided")

    backup_existing(settings.merged_path, backup_dir=settings.backups_dir, stamp=stamp)
    settings.ensure_dirs()
    return merge_gpkg_files(raw_files, settings.merged_path)


def _run_pmtiles(
    settings: Settings,
    merged_path: Path,
    *,
    dry_run: bool,
    stamp: str,
) -> Path:
    """Run PMTiles stage. Returns PMTiles path."""
    if dry_run:
        logger.info("pmtiles_skipped_dry_run")
        return settings.pmtiles_path

    backup_existing(settings.pmtiles_path, backup_dir=settings.backups_dir, stamp=stamp)
    settings.ensure_dirs()
    return generate_pmtiles(
        merged_path,
        settings.pmtiles_path,
        min_zoom=settings.pmtiles.min_zoom,
        max_zoom=settings.pmtiles.max_zoom,
        base_zoom=settings.pmtiles.base_zoom,
        layer_name=settings.pmtiles.layer_name,
        tippecanoe_path=settings.pmtiles.tippecanoe_path,
        drop_densest=settings.pmtiles.drop_densest,
        extend_zooms=settings.pmtiles.extend_zooms,
    )


def _run_sqlite(
    settings: Settings,
    merged_path: Path,
    *,
    dry_run: bool,
    stamp: str,
    etag: str,
) -> int:
    """Run SQLite stage. Returns number of parcels loaded."""
    if dry_run:
        logger.info("sqlite_skipped_dry_run")
        return 0

    backup_existing(settings.sqlite_path, backup_dir=settings.backups_dir, stamp=stamp)
    settings.ensure_dirs()
    count = load_parcels_from_gpkg(
        merged_path,
        settings.sqlite_path,
        batch_size=settings.sqlite.batch_size,
    )
    update_sync_meta(
        settings.sqlite_path,
        parcels_count=count,
        etag=etag,
        pmtiles_path=settings.pmtiles_path,
    )
    return count


def _fail_with_partial(
    settings: Settings,
    stamp: str,
    errors: list[str],
    started: datetime,
    *,
    raw_files: list[Path],
    download_summary: dict[str, Any],
    etag: str,
) -> PipelineResult:
    """Construct a partial PipelineResult when a stage fails.

    Rolls back any artifacts whose pre-run backup exists in this run's
    timestamp directory, so the on-disk state matches what it was before
    the pipeline started.
    """
    finished = _utc_now()
    restored: list[str] = []
    for candidate in (settings.merged_path, settings.pmtiles_path, settings.sqlite_path):
        backup = _backup_path(settings.backups_dir, stamp, candidate)
        if backup.exists():
            if restore_backup(backup, candidate):
                restored.append(candidate.name)
    if restored:
        logger.warning("partial_pipeline_rolled_back", restored=restored)
    return PipelineResult(
        pmtiles_path=settings.pmtiles_path,
        sqlite_path=settings.sqlite_path,
        merged_path=settings.merged_path,
        raw_files=raw_files,
        parcels_count=parcels_count(settings.sqlite_path),
        started_at=started,
        finished_at=finished,
        errors=errors,
        download_summary=download_summary,
        etag=etag,
    )


async def run_pipeline(
    settings: Settings,
    *,
    powiat_prefix: str | None = None,
    powiat_list_source: str | Path | None = None,
    skip_download: bool = False,
    skip_merge: bool = False,
    skip_pmtiles: bool = False,
    skip_sqlite: bool = False,
    dry_run: bool = False,
) -> PipelineResult:
    """Run the full ETL pipeline (download + merge + PMTiles + SQLite).

    Each stage is independent and skippable. If a stage fails, the original
    artifact is preserved from a timestamped backup (taken before that stage)
    and a partial :class:`PipelineResult` is returned with the error message
    populated. ``PipelineError`` is only raised for download-stage failures
    that prevent the rest from running.

    Args:
        settings: Pipeline settings (paths, retries, etc.).
        powiat_prefix: Optional TERYT prefix filter for download stage.
        powiat_list_source: Local file path or remote URL for powiat list.
        skip_download: Skip download; reuse existing ``raw_files``.
        skip_merge: Skip merge; assume ``merged_path`` exists.
        skip_pmtiles: Skip PMTiles generation.
        skip_sqlite: Skip SQLite import.
        dry_run: Don't write any files; only validate wiring.
    """
    started = _utc_now()
    settings.ensure_dirs()
    stamp = _format_backup_ts(started)
    errors: list[str] = []
    raw_files: list[Path] = []
    download_summary: dict[str, Any] = {}
    etag = ""

    if dry_run:
        logger.info(
            "pipeline_dry_run",
            powiat_prefix=powiat_prefix,
            skip_download=skip_download,
            skip_merge=skip_merge,
            skip_pmtiles=skip_pmtiles,
            skip_sqlite=skip_sqlite,
        )

    try:
        if skip_download:
            if not dry_run:
                raw_files = sorted(settings.raw_dir.glob("*.gpkg"))
                if not raw_files:
                    raise PipelineError(
                        f"skip_download=True but no .gpkg files in {settings.raw_dir}"
                    )
            logger.info("download_skipped_explicit", files=len(raw_files))
            download_summary = {"skipped": True, "reason": "skip_download"}
        else:
            try:
                raw_files, download_summary, etag = await _run_download(
                    settings,
                    powiat_prefix=powiat_prefix,
                    powiat_list_source=powiat_list_source,
                    dry_run=dry_run,
                )
            except PipelineError as exc:
                errors.append(f"download: {exc}")
                logger.error("pipeline_stage_failed", stage="download", error=str(exc))
                return _fail_with_partial(
                    settings,
                    stamp,
                    errors,
                    started,
                    raw_files=[],
                    download_summary=download_summary,
                    etag=etag,
                )

        merged_path = settings.merged_path
        if not skip_merge:
            try:
                merged_path = _run_merge(settings, raw_files, dry_run=dry_run, stamp=stamp)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"merge: {exc}")
                logger.error(
                    "pipeline_stage_failed",
                    stage="merge",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                return _fail_with_partial(
                    settings,
                    stamp,
                    errors,
                    started,
                    raw_files=raw_files,
                    download_summary=download_summary,
                    etag=etag,
                )

        if not skip_pmtiles:
            try:
                _run_pmtiles(settings, merged_path, dry_run=dry_run, stamp=stamp)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"pmtiles: {exc}")
                logger.error(
                    "pipeline_stage_failed",
                    stage="pmtiles",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                return _fail_with_partial(
                    settings,
                    stamp,
                    errors,
                    started,
                    raw_files=raw_files,
                    download_summary=download_summary,
                    etag=etag,
                )

        parcels = 0
        if not skip_sqlite:
            try:
                parcels = _run_sqlite(
                    settings,
                    merged_path,
                    dry_run=dry_run,
                    stamp=stamp,
                    etag=etag,
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"sqlite: {exc}")
                logger.error(
                    "pipeline_stage_failed",
                    stage="sqlite",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                return _fail_with_partial(
                    settings,
                    stamp,
                    errors,
                    started,
                    raw_files=raw_files,
                    download_summary=download_summary,
                    etag=etag,
                )

    finally:
        if not dry_run:
            cleanup_old_backups(settings.backups_dir, keep=settings.retention.backups_keep)

    finished = _utc_now()
    logger.info(
        "pipeline_done",
        parcels=parcels,
        duration_seconds=(finished - started).total_seconds(),
    )
    return PipelineResult(
        pmtiles_path=settings.pmtiles_path,
        sqlite_path=settings.sqlite_path,
        merged_path=settings.merged_path,
        raw_files=raw_files,
        parcels_count=parcels,
        started_at=started,
        finished_at=finished,
        errors=errors,
        download_summary=download_summary,
        etag=etag,
    )


def run_pipeline_sync(
    settings: Settings,
    *,
    powiat_prefix: str | None = None,
    powiat_list_source: str | Path | None = None,
    skip_download: bool = False,
    skip_merge: bool = False,
    skip_pmtiles: bool = False,
    skip_sqlite: bool = False,
    dry_run: bool = False,
) -> PipelineResult:
    """Synchronous wrapper for :func:`run_pipeline`."""
    return asyncio.run(
        run_pipeline(
            settings,
            powiat_prefix=powiat_prefix,
            powiat_list_source=powiat_list_source,
            skip_download=skip_download,
            skip_merge=skip_merge,
            skip_pmtiles=skip_pmtiles,
            skip_sqlite=skip_sqlite,
            dry_run=dry_run,
        )
    )


def serialize_result(result: PipelineResult) -> str:
    """Serialize a :class:`PipelineResult` to JSON for logging / reports."""
    payload = {
        "pmtiles_path": str(result.pmtiles_path),
        "sqlite_path": str(result.sqlite_path),
        "merged_path": str(result.merged_path),
        "raw_files": [str(p) for p in result.raw_files],
        "parcels_count": result.parcels_count,
        "started_at": result.started_at.isoformat(),
        "finished_at": result.finished_at.isoformat(),
        "errors": result.errors,
        "success": result.success,
        "download_summary": result.download_summary,
        "etag": result.etag,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


__all__ = [
    "PipelineError",
    "PipelineResult",
    "backup_existing",
    "cleanup_old_backups",
    "restore_backup",
    "run_pipeline",
    "run_pipeline_sync",
    "serialize_result",
]
