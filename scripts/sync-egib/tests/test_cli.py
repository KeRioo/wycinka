"""Tests for the CLI entrypoint (egib_sync.__main__)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

from egib_sync import __main__ as cli_main


def test_cli_help_exits_zero():
    with pytest.raises(SystemExit) as exc_info:
        cli_main.main(["--help"])
    assert exc_info.value.code == 0


def test_cli_dry_run_with_default_settings(tmp_path):
    rc = cli_main.main(
        [
            "--dry-run",
            "--data-dir",
            str(tmp_path),
            "--powiat",
            "14",
            "--skip-download",
            "--skip-merge",
            "--skip-pmtiles",
            "--skip-sqlite",
        ]
    )
    assert rc == 0


def test_cli_writes_report(tmp_path):
    report_path = tmp_path / "report.json"
    rc = cli_main.main(
        [
            "--dry-run",
            "--data-dir",
            str(tmp_path),
            "--skip-download",
            "--skip-merge",
            "--skip-pmtiles",
            "--skip-sqlite",
            "--report",
            str(report_path),
        ]
    )
    assert rc == 0
    assert report_path.exists()
    payload = json.loads(report_path.read_text(encoding="utf-8"))
    assert "success" in payload
    assert payload["success"] is True


def test_cli_log_level_override(tmp_path):
    rc = cli_main.main(
        [
            "--dry-run",
            "--data-dir",
            str(tmp_path),
            "--log-level",
            "DEBUG",
            "--skip-download",
            "--skip-merge",
            "--skip-pmtiles",
            "--skip-sqlite",
        ]
    )
    assert rc == 0


def test_cli_invalid_log_level_exits_nonzero():
    with pytest.raises(SystemExit) as exc_info:
        cli_main.main(["--log-level", "INVALID"])
    assert exc_info.value.code != 0


def test_cli_powiat_list_source_override_creates_settings(tmp_path):
    src = tmp_path / "powiat_list.json"
    src.write_text("[]", encoding="utf-8")
    rc = cli_main.main(
        [
            "--dry-run",
            "--data-dir",
            str(tmp_path),
            "--powiat-list-source",
            str(src),
            "--skip-download",
            "--skip-merge",
            "--skip-pmtiles",
            "--skip-sqlite",
        ]
    )
    assert rc == 0


def test_cli_returns_2_when_pipeline_fails(tmp_path):
    """Gdy pipeline ma błędy → exit code 2 (częściowy sukces)."""
    from egib_sync.pipeline import PipelineResult

    failed = PipelineResult(
        pmtiles_path=Path("/nonexistent.pmtiles"),
        sqlite_path=Path("/nonexistent.sqlite"),
        merged_path=Path("/nonexistent.gpkg"),
        raw_files=[],
        parcels_count=0,
        started_at=datetime(2026, 9, 30, 20, 0, 0, tzinfo=timezone.utc),
        finished_at=datetime(2026, 9, 30, 20, 0, 1, tzinfo=timezone.utc),
        errors=["simulated failure"],
        download_summary={},
        etag="",
    )

    with patch("egib_sync.__main__.run_pipeline_sync", return_value=failed):
        rc = cli_main.main(
            [
                "--data-dir",
                str(tmp_path),
                "--skip-download",
                "--skip-merge",
                "--skip-pmtiles",
                "--skip-sqlite",
            ]
        )
        assert rc == 2


def test_cli_returns_1_when_pipeline_raises(tmp_path):
    """Gdy pipeline rzuci wyjątek → exit code 1."""
    with patch(
        "egib_sync.__main__.run_pipeline_sync",
        side_effect=RuntimeError("boom"),
    ):
        rc = cli_main.main(
            [
                "--data-dir",
                str(tmp_path),
                "--skip-download",
                "--skip-merge",
                "--skip-pmtiles",
                "--skip-sqlite",
            ]
        )
        assert rc == 1


def test_cli_no_args_invokes_full_dry_run(tmp_path, monkeypatch):
    """Bez argumentów: dry-run domyślnie wyłączony, ale nie uruchamia download."""
    monkeypatch.setattr("sys.argv", ["egib-sync", "--dry-run", "--data-dir", str(tmp_path)])
    rc = cli_main.main()
    assert rc == 0


def test_cli_report_parent_dir_is_created(tmp_path):
    report_path = tmp_path / "nested" / "deep" / "report.json"
    rc = cli_main.main(
        [
            "--dry-run",
            "--data-dir",
            str(tmp_path),
            "--skip-download",
            "--skip-merge",
            "--skip-pmtiles",
            "--skip-sqlite",
            "--report",
            str(report_path),
        ]
    )
    assert rc == 0
    assert report_path.exists()
    assert report_path.parent.is_dir()


def test_cli_keyboard_interrupt_returns_130(tmp_path):
    with patch(
        "egib_sync.__main__.run_pipeline_sync",
        side_effect=KeyboardInterrupt(),
    ):
        rc = cli_main.main(
            [
                "--data-dir",
                str(tmp_path),
                "--skip-download",
                "--skip-merge",
                "--skip-pmtiles",
                "--skip-sqlite",
            ]
        )
        assert rc == 130
