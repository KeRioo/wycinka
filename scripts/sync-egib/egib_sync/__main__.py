"""CLI entrypoint: python -m egib_sync [args]."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from egib_sync.config import Settings, SourcesSettings
from egib_sync.logging import configure_logging, get_logger
from egib_sync.pipeline import run_pipeline_sync

logger = get_logger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="egib-sync",
        description="ETL pipeline for EGiB (Polish land registry) into PMTiles + SQLite",
    )
    parser.add_argument(
        "--powiat",
        metavar="TERYT_PREFIX",
        help="Filter powiats by TERYT prefix (np. '14' = mazowieckie)",
    )
    parser.add_argument(
        "--wfs",
        action="store_true",
        help=(
            "Use the GUGiK zbiorcza WFS source for a single powiat "
            "(requires --powiat <TERYT>); bypasses the legacy powiat list / GPKG URLs"
        ),
    )
    parser.add_argument(
        "--source",
        choices=["powiat", "parquet-kraj"],
        default="powiat",
        help=(
            "Data source: 'powiat' runs the legacy per-powiat pipeline; "
            "'parquet-kraj' runs the nation-wide EziUDP GeoParquet pipeline"
        ),
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="kraj pipeline: source .parquet (default: <data_dir>/egib-raw/0_dzialki.parquet)",
    )
    parser.add_argument(
        "--download-kraj",
        action="store_true",
        help="kraj pipeline: download the parquet first when --input does not exist",
    )
    parser.add_argument(
        "--pmtiles-out",
        type=Path,
        default=None,
        help="kraj pipeline: PMTiles destination override (default: <data_dir>/pmtiles/dzialki.pmtiles)",
    )
    parser.add_argument(
        "--sqlite-out",
        type=Path,
        default=None,
        help="kraj pipeline: SQLite destination override (default: <data_dir>/sqlite/parcels.sqlite)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip download stage (use existing files in raw_dir)",
    )
    parser.add_argument("--skip-merge", action="store_true", help="Skip merge stage")
    parser.add_argument("--skip-pmtiles", action="store_true", help="Skip PMTiles generation")
    parser.add_argument("--skip-sqlite", action="store_true", help="Skip SQLite import")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate configuration and stages without writing any files",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Data directory (default: ./data)",
    )
    parser.add_argument(
        "--powiat-list-source",
        type=str,
        default=None,
        help="Path or URL to powiat list (overrides Settings.sources.powiat_list_url)",
    )
    parser.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=None,
        help="Logging level (default: from Settings)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="Write JSON report to this path after pipeline finishes",
    )
    return parser


def _build_settings(args: argparse.Namespace) -> Settings:
    overrides: dict[str, object] = {}
    if args.data_dir is not None:
        overrides["data_dir"] = args.data_dir
    if args.log_level is not None:
        overrides["log_level"] = args.log_level
    if args.powiat_list_source is not None:
        overrides["sources"] = SourcesSettings(powiat_list_url=args.powiat_list_source)
    if args.wfs:
        sources = overrides.get("sources")
        if isinstance(sources, SourcesSettings):
            sources.use_wfs = True
        else:
            overrides["sources"] = SourcesSettings(use_wfs=True)
    if overrides:
        return Settings(**overrides)
    return Settings()


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    settings = _build_settings(args)
    configure_logging(settings.log_level, json_output=settings.log_json)
    settings.ensure_dirs()

    if args.source == "parquet-kraj":
        return _main_kraj(args, settings)

    logger.info(
        "pipeline_starting",
        data_dir=str(settings.data_dir),
        powiat_prefix=args.powiat,
        skip_download=args.skip_download,
        skip_merge=args.skip_merge,
        skip_pmtiles=args.skip_pmtiles,
        skip_sqlite=args.skip_sqlite,
        dry_run=args.dry_run,
    )

    try:
        result = run_pipeline_sync(
            settings,
            powiat_prefix=args.powiat,
            skip_download=args.skip_download,
            skip_merge=args.skip_merge,
            skip_pmtiles=args.skip_pmtiles,
            skip_sqlite=args.skip_sqlite,
            dry_run=args.dry_run,
        )
    except KeyboardInterrupt:
        logger.warning("pipeline_interrupted")
        return 130
    except Exception as exc:
        logger.exception("pipeline_failed", error=str(exc))
        return 1

    logger.info(
        "pipeline_finished",
        success=result.success,
        parcels=result.parcels_count,
        errors=len(result.errors),
    )

    if args.report is not None:
        from egib_sync.pipeline import serialize_result

        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(serialize_result(result), encoding="utf-8")
        logger.info("report_written", path=str(args.report))

    return 0 if result.success else 2


def _main_kraj(args: argparse.Namespace, settings: Settings) -> int:
    from egib_sync.kraj_parquet import KRAJ_PARQUET_URL, ensure_kraj_parquet
    from egib_sync.kraj_pipeline import run_kraj_pipeline, serialize_kraj_result

    parquet_path = args.input or settings.kraj_parquet_default_path
    if args.dry_run and not parquet_path.exists():
        logger.error("kraj_input_missing", path=str(parquet_path))
        return 2
    if not parquet_path.exists() and args.download_kraj:
        try:
            parquet_path = ensure_kraj_parquet(parquet_path, KRAJ_PARQUET_URL)
        except KeyboardInterrupt:
            logger.warning("kraj_download_interrupted")
            return 130
        except Exception as exc:
            logger.exception("kraj_download_failed", error=str(exc))
            return 2

    try:
        result = run_kraj_pipeline(
            settings,
            parquet_path=parquet_path,
            pmtiles_output=args.pmtiles_out,
            db_output=args.sqlite_out,
            skip_tiles=args.skip_pmtiles,
            skip_sqlite=args.skip_sqlite,
            dry_run=args.dry_run,
        )
    except KeyboardInterrupt:
        logger.warning("kraj_pipeline_interrupted")
        return 130
    except Exception as exc:
        logger.exception("kraj_pipeline_failed", error=str(exc))
        return 1

    logger.info(
        "kraj_pipeline_finished",
        success=result.success,
        parcels=result.parcels_count,
        errors=len(result.errors),
    )

    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(serialize_kraj_result(result), encoding="utf-8")
        logger.info("report_written", path=str(args.report))

    return 0 if result.success else 2


if __name__ == "__main__":
    sys.exit(main())
