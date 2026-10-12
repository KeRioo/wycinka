"""CLI tests for the kraj GeoParquet pipeline switch (--source parquet-kraj)."""

from __future__ import annotations

from pathlib import Path

import pytest

from egib_sync import __main__ as cli_main
from tests.helpers.kraj_parquet_builder import make_row, write_multigroup_parquet


def test_cli_kraj_when_dry_run_then_zero_and_no_writes(tmp_path: Path):
    groups = [[make_row("141701_1.0022.1", easting=524_000.0, northing=481_000.0)]]
    parquet = write_multigroup_parquet(tmp_path / "in.parquet", groups)

    rc = cli_main.main(
        [
            "--source",
            "parquet-kraj",
            "--dry-run",
            "--input",
            str(parquet),
            "--data-dir",
            str(tmp_path / "data"),
        ]
    )

    assert rc == 0
    assert not (tmp_path / "data" / "sqlite" / "parcels.sqlite").exists()
    assert not (tmp_path / "data" / "pmtiles" / "dzialki.pmtiles").exists()


def test_cli_kraj_when_input_missing_non_dry_then_rc2(tmp_path: Path):
    rc = cli_main.main(
        [
            "--source",
            "parquet-kraj",
            "--input",
            str(tmp_path / "very-missing.parquet"),
            "--data-dir",
            str(tmp_path / "data"),
        ]
    )

    assert rc == 2


def test_cli_kraj_when_report_then_json_written(tmp_path: Path):
    groups = [[make_row("141701_1.0022.2", easting=524_100.0, northing=481_000.0)]]
    parquet = write_multigroup_parquet(tmp_path / "in.parquet", groups)
    report = tmp_path / "kraj-report.json"

    rc = cli_main.main(
        [
            "--source",
            "parquet-kraj",
            "--dry-run",
            "--input",
            str(parquet),
            "--data-dir",
            str(tmp_path / "data"),
            "--report",
            str(report),
        ]
    )

    assert rc == 0
    assert report.exists()
    assert "parquet_path" in report.read_text(encoding="utf-8")


def test_cli_default_source_remains_powiat(tmp_path: Path):
    with pytest.raises(SystemExit) as exc_info:
        cli_main.main(["--help"])
    assert exc_info.value.code == 0
    import argparse

    parser_args = cli_main.build_parser().get_default("source")
    assert parser_args == "powiat"
