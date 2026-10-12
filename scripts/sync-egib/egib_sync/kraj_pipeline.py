"""Nation-wide EGiB pipeline from the kraj GeoParquet export.

Stages (each atomic; intermediate artifacts cleaned up in sequence):

1. **GeoJSONSeq** — stream the kraj parquet into a gzipped GeoJSONSeq staging
   file (the only shared artifact between the reader and tippecanoe).
2. **Tiles** — ``gzip -dc | tippecanoe`` streaming into an MBTiles/PMTiles
   archive; converted to PMTiles v3 and renamed into place on success.
   After a successful tiles stage the GeoJSONSeq staging file is removed.
3. **SQLite** — second streaming pass over the parquet into a fresh
   staging database (transaction per batch), renamed into place on success.

Failure of any stage leaves previously deployed artifacts untouched and
reports the error in :class:`KrajPipelineResult.errors`.
"""

from __future__ import annotations

import json
import multiprocessing
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from egib_sync.config import Settings
from egib_sync.geojsonseq import GeojsonSeqError, write_geojsonseq_gzip
from egib_sync.kraj_parquet import (
    KRAJ_DATASOURCE,
    KrajParquetError,
    KrajParquetReader,
)
from egib_sync.logging import get_logger
from egib_sync.pmtiles_gen import generate_pmtiles_geojsonseq
from egib_sync.sqlite_loader import load_parcels_stream, update_sync_meta, vacuum

logger = get_logger(__name__)

GEOJSONSEQ_NAME: Final[str] = "kraj_dzialki.geojsonl.gz"
_BYTES_PER_FEATURE_GEOJSONSEQ_GZ: Final[int] = 120
_BYTES_PER_ROW_SQLITE: Final[int] = 300
_BYTES_PER_FEATURE_PMTILES: Final[int] = 90


@dataclass(frozen=True, slots=True)
class KrajPipelineResult:
    """Outcome of :func:`run_kraj_pipeline`."""

    parquet_path: Path
    geojsonseq_path: Path
    pmtiles_path: Path
    sqlite_path: Path
    parcels_count: int
    skipped_parcel_count: int
    parquet_rows: int
    duplicate_count: int
    geojsonseq_bytes: int
    pmtiles_bytes: int
    sqlite_bytes: int
    started_at: datetime
    finished_at: datetime
    errors: list[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return not self.errors


class KrajPipelineError(RuntimeError):
    """Raised when a kraj pipeline stage fails irrecoverably."""


def _utc_now() -> datetime:
    return datetime.now(UTC)


def count_parcel_duplicates(db_path: Path) -> int:
    """Rows in ``parcels`` beyond the number of distinct TERYT ids."""
    import sqlite3

    if not db_path.exists():
        return 0
    conn = sqlite3.connect(str(db_path))
    try:
        total = int(conn.execute("SELECT COUNT(*) FROM parcels").fetchone()[0])
        distinct = int(
            conn.execute("SELECT COUNT(*) FROM (SELECT DISTINCT teryt FROM parcels)").fetchone()[0]
        )
        return total - distinct
    finally:
        conn.close()


def _stage_geojsonseq_sharded(
    parquet_path: Path,
    settings: Settings,
    *,
    shards: int,
    batch_rows: int,
    output: Path,
) -> tuple[int, list[Path]]:
    """Stage 1 (sharded): N processes each read their own row groups.

    Each worker writes ``output.shard{i}`` (gzipped GeoJSONSeq). The shard
    files are consumed by tippecanoe via ``cat`` (order is irrelevant) and
    by the SQLite stage. Row groups are distributed modulo-style, so the
    country is covered without overlap.
    """

    def _worker(args: tuple[int, int, int]) -> tuple[int, str]:
        shard_index, total_shards, batch = args
        reader = KrajParquetReader(parquet_path)
        shard_output = Path(str(output) + f".shard{shard_index}")
        count = write_geojsonseq_gzip(
            reader.iter_parcels_shard(shard_index, total_shards, batch_rows=batch),
            shard_output,
        )
        reader.close()
        return count, str(shard_output)

    jobs = [(i, shards, batch_rows) for i in range(shards)]
    ctx = multiprocessing.get_context("fork")
    with ctx.Pool(processes=shards) as pool:
        results = pool.map(_worker, jobs)

    total = 0
    shard_paths: list[Path] = []
    for count, path in results:
        total += count
        shard_paths.append(Path(path))
    shard_paths.sort(key=lambda p: int(str(p).rsplit("shard", 1)[-1]))
    logger.info(
        "kraj_stage_geojsonseq_shards_done",
        features=total,
        shards=shards,
        bytes=sum(p.stat().st_size for p in shard_paths),
    )
    if total == 0:
        raise GeojsonSeqError(f"no parcels to write, aborting GeoJSONSeq export: {output}")
    return total, shard_paths


def _stage_geojsonseq(
    reader: KrajParquetReader,
    settings: Settings,
    *,
    batch_rows: int,
    max_row_groups: int | None,
    max_rows: int | None,
    output: Path,
) -> int:
    """Stage 1: parquet stream -> gzipped GeoJSONSeq staging file."""
    count = write_geojsonseq_gzip(
        reader.iter_parcels(
            batch_rows=batch_rows,
            max_row_groups=max_row_groups,
            max_rows=max_rows,
        ),
        output,
    )
    logger.info("kraj_stage_geojsonseq_done", features=count, output=str(output))
    return count


def _stage_tiles(
    settings: Settings,
    *,
    geojsonseq_path: Path,
    pmtiles_output: Path,
    staging_dir: Path,
    geojsonseq_paths: list[Path] | None = None,
) -> int:
    """Stage 2: GeoJSONSeq -> tippecanoe (stdin stream) -> PMTiles v3.

    ``geojsonseq_paths`` = sharded inputs (consumed via ``cat``); takes
    priority over the single ``geojsonseq_path``.
    """
    tmp_tiles_dir = staging_dir / "tippecanoe-tmp"
    tmp_tiles_dir.mkdir(parents=True, exist_ok=True)
    try:
        if geojsonseq_paths is not None:
            generate_pmtiles_geojsonseq(
                geojsonseq_paths,
                pmtiles_output,
                min_zoom=settings.kraj.min_zoom,
                max_zoom=settings.kraj.max_zoom,
                base_zoom=settings.kraj.base_zoom,
                layer_name=settings.kraj.layer_name,
                tippecanoe_path=settings.kraj.tippecanoe_path,
                drop_densest=settings.kraj.drop_densest,
                extend_zooms=settings.kraj.extend_zooms,
                temporary_directory=tmp_tiles_dir,
                pmtiles_convert_path=settings.kraj.pmtiles_convert_path,
            )
        else:
            generate_pmtiles_geojsonseq(
                geojsonseq_path,
                pmtiles_output,
                min_zoom=settings.kraj.min_zoom,
                max_zoom=settings.kraj.max_zoom,
                base_zoom=settings.kraj.base_zoom,
                layer_name=settings.kraj.layer_name,
                tippecanoe_path=settings.kraj.tippecanoe_path,
                drop_densest=settings.kraj.drop_densest,
                extend_zooms=settings.kraj.extend_zooms,
                temporary_directory=tmp_tiles_dir,
                pmtiles_convert_path=settings.kraj.pmtiles_convert_path,
            )
    finally:
        if tmp_tiles_dir.exists():
            shutil.rmtree(tmp_tiles_dir, ignore_errors=True)
    size = pmtiles_output.stat().st_size
    logger.info("kraj_stage_tiles_done", output=str(pmtiles_output), bytes=size)
    return size


def _stage_sqlite(
    reader: KrajParquetReader,
    settings: Settings,
    *,
    db_output: Path,
    batch_rows: int,
    max_row_groups: int | None,
    max_rows: int | None,
) -> tuple[int, int]:
    """Stage 3: second parquet pass -> fresh SQLite + R-tree staging db."""
    staging_db = db_output.with_name(f".{db_output.name}.tmp")
    if staging_db.exists():
        staging_db.unlink()
    try:
        inserted = load_parcels_stream(
            reader.iter_parcels(
                batch_rows=batch_rows,
                max_row_groups=max_row_groups,
                max_rows=max_rows,
            ),
            staging_db,
            batch_size=batch_rows,
            datasource=KRAJ_DATASOURCE,
        )
        duplicates = count_parcel_duplicates(staging_db)
        vacuum(staging_db)
        staging_db.replace(db_output)
        size = db_output.stat().st_size
    except BaseException:
        if staging_db.exists():
            staging_db.unlink(missing_ok=True)
        raise
    logger.info("kraj_stage_sqlite_done", output=str(db_output), rows=inserted, bytes=size)
    return inserted, duplicates


def run_kraj_pipeline(
    settings: Settings,
    *,
    parquet_path: Path,
    pmtiles_output: Path | None = None,
    db_output: Path | None = None,
    skip_tiles: bool = False,
    skip_sqlite: bool = False,
    max_row_groups: int | None = None,
    max_rows: int | None = None,
    dry_run: bool = False,
    shards: int = 1,
) -> KrajPipelineResult:
    """Run the kraj pipeline on a GeoParquet export.

    Args:
        settings: pipeline settings (paths, kraj zooms and flags).
        parquet_path: source ``*.parquet`` (kraj or single-voivodeship file).
        pmtiles_output: override for the tile artifact destination.
        db_output: override for the SQLite database destination.
        skip_tiles: write no GeoJSONSeq and run no tippecanoe.
        skip_sqlite: do not load the SQLite database.
        max_row_groups: process only the first N row groups (samples).
        max_rows: cap the number of canonical parcels (samples / tests).
        dry_run: validate configuration and source only; write nothing.
    """
    started = _utc_now()
    pmtiles_path = pmtiles_output or settings.pmtiles_path
    sqlite_path = db_output or settings.sqlite_path
    settings.ensure_dirs()
    staging = settings.staging_dir
    kraj_shards = shards if shards >= 1 else 1

    try:
        reader = KrajParquetReader(parquet_path)
    except KrajParquetError as exc:
        return _result(
            parquet_path=parquet_path,
            pmtiles_path=pmtiles_path,
            sqlite_path=sqlite_path,
            started=started,
            errors=[f"parquet: {exc}"],
        )

    geojsonseq_path = staging / GEOJSONSEQ_NAME
    try:
        logger.info(
            "kraj_pipeline_start",
            parquet=str(reader.path),
            parquet_rows=reader.num_rows,
            pmtiles=str(pmtiles_path),
            sqlite=str(sqlite_path),
            dry_run=dry_run,
        )
        if dry_run:
            logger.info("kraj_pipeline_dry_run", rows=reader.num_rows, schema=str(reader.schema()))
            return _result(
                parquet_path=reader.path,
                pmtiles_path=pmtiles_path,
                sqlite_path=sqlite_path,
                started=started,
                parquet_rows=reader.num_rows,
            )

        geojsonseq_bytes = 0
        shard_paths: list[Path] | None = None
        if not skip_tiles:
            if max_row_groups is not None or max_rows is not None:
                geojsonseq_bytes = _stage_geojsonseq(
                    reader,
                    settings,
                    batch_rows=settings.kraj.read_batch_rows,
                    max_row_groups=max_row_groups,
                    max_rows=max_rows,
                    output=geojsonseq_path,
                )
            elif kraj_shards > 1:
                geojsonseq_bytes, shard_paths = _stage_geojsonseq_sharded(
                    parquet_path,
                    settings,
                    shards=kraj_shards,
                    batch_rows=settings.kraj.read_batch_rows,
                    output=geojsonseq_path,
                )
            else:
                geojsonseq_bytes = _stage_geojsonseq(
                    reader,
                    settings,
                    batch_rows=settings.kraj.read_batch_rows,
                    max_row_groups=max_row_groups,
                    max_rows=max_rows,
                    output=geojsonseq_path,
                )

        parcels = 0
        duplicates = 0
        if not skip_sqlite:
            try:
                parcels, duplicates = _stage_sqlite(
                    reader,
                    settings,
                    db_output=sqlite_path,
                    batch_rows=settings.kraj.sqlite_batch_rows,
                    max_row_groups=max_row_groups,
                    max_rows=max_rows,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("kraj_stage_sqlite_failed")
                return _result(
                    parquet_path=reader.path,
                    pmtiles_path=pmtiles_path,
                    sqlite_path=sqlite_path,
                    started=started,
                    errors=[f"sqlite: {exc}"],
                    geojsonseq_bytes=geojsonseq_bytes,
                )

        pmtiles_bytes = 0
        if not skip_tiles:
            try:
                pmtiles_bytes = _stage_tiles(
                    settings,
                    geojsonseq_path=geojsonseq_path,
                    geojsonseq_paths=shard_paths,
                    pmtiles_output=pmtiles_path,
                    staging_dir=staging,
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("kraj_stage_tiles_failed")
                return _result(
                    parquet_path=reader.path,
                    pmtiles_path=pmtiles_path,
                    sqlite_path=sqlite_path,
                    started=started,
                    parcels_count=parcels,
                    duplicate_count=duplicates,
                    errors=[f"tiles: {exc}"],
                    geojsonseq_bytes=geojsonseq_bytes,
                )
            geojsonseq_path.unlink(missing_ok=True)
            for shard in shard_paths or ():
                shard.unlink(missing_ok=True)

        metadata_errors: list[str] = []
        try:
            update_sync_meta(
                sqlite_path,
                parcels_count=parcels,
                etag=f"kraj-parquet|{reader.path.stat().st_mtime_ns}",
                pmtiles_path=pmtiles_path,
                extras={"datasource": KRAJ_DATASOURCE, "pipeline": "kraj-parquet"},
            )
        except Exception as exc:  # noqa: BLE001
            metadata_errors.append(f"sync_meta: {exc}")

        result = _result(
            parquet_path=reader.path,
            pmtiles_path=pmtiles_path,
            sqlite_path=sqlite_path,
            started=started,
            parcels_count=parcels,
            duplicate_count=duplicates,
            parquet_rows=reader.num_rows,
            geojsonseq_path=geojsonseq_path,
            geojsonseq_bytes=geojsonseq_bytes,
            pmtiles_bytes=pmtiles_bytes,
            sqlite_bytes=sqlite_path.stat().st_size if sqlite_path.exists() else 0,
            errors=metadata_errors,
        )
        logger.info(
            "kraj_pipeline_done",
            success=result.success,
            parcels=result.parcels_count,
            duplicates=result.duplicate_count,
            duration_seconds=(result.finished_at - result.started_at).total_seconds(),
        )
        return result
    finally:
        reader.close()


def _result(
    *,
    parquet_path: Path,
    pmtiles_path: Path,
    sqlite_path: Path,
    started: datetime,
    errors: list[str] | None = None,
    parcels_count: int = 0,
    duplicate_count: int = 0,
    parquet_rows: int = 0,
    geojsonseq_path: Path | None = None,
    geojsonseq_bytes: int = 0,
    pmtiles_bytes: int = 0,
    sqlite_bytes: int = 0,
) -> KrajPipelineResult:
    return KrajPipelineResult(
        parquet_path=parquet_path,
        geojsonseq_path=geojsonseq_path or (parquet_path.parent / GEOJSONSEQ_NAME),
        pmtiles_path=pmtiles_path,
        sqlite_path=sqlite_path,
        parcels_count=parcels_count,
        skipped_parcel_count=parquet_rows - parcels_count if parquet_rows else 0,
        parquet_rows=parquet_rows,
        duplicate_count=duplicate_count,
        geojsonseq_bytes=geojsonseq_bytes,
        pmtiles_bytes=pmtiles_bytes,
        sqlite_bytes=sqlite_bytes,
        started_at=started,
        finished_at=_utc_now(),
        errors=errors or [],
    )


def serialize_kraj_result(result: KrajPipelineResult) -> str:
    """Serialize :class:`KrajPipelineResult` to JSON for reports."""
    payload: dict[str, Any] = {
        "parquet_path": str(result.parquet_path),
        "geojsonseq_path": str(result.geojsonseq_path),
        "pmtiles_path": str(result.pmtiles_path),
        "sqlite_path": str(result.sqlite_path),
        "parcels_count": result.parcels_count,
        "skipped_parcel_count": result.skipped_parcel_count,
        "parquet_rows": result.parquet_rows,
        "duplicate_count": result.duplicate_count,
        "geojsonseq_bytes": result.geojsonseq_bytes,
        "pmtiles_bytes": result.pmtiles_bytes,
        "sqlite_bytes": result.sqlite_bytes,
        "started_at": result.started_at.isoformat(),
        "finished_at": result.finished_at.isoformat(),
        "success": result.success,
        "errors": result.errors,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


def estimate_kraj_disk_bytes(parquet_rows: int) -> dict[str, int]:
    """Rough disk budget (bytes) for a full kraj run, derived from the sample."""
    geojsonseq = parquet_rows * _BYTES_PER_FEATURE_GEOJSONSEQ_GZ
    sqlite = parquet_rows * _BYTES_PER_ROW_SQLITE
    pmtiles = parquet_rows * _BYTES_PER_FEATURE_PMTILES
    return {
        "geojsonseq_gz": geojsonseq,
        "sqlite": sqlite,
        "pmtiles": pmtiles,
        "total_peak": geojsonseq + sqlite + pmtiles,
    }


__all__ = [
    "GEOJSONSEQ_NAME",
    "KrajPipelineError",
    "KrajPipelineResult",
    "count_parcel_duplicates",
    "estimate_kraj_disk_bytes",
    "run_kraj_pipeline",
    "serialize_kraj_result",
]
