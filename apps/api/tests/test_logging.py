"""Tests for production file logging (structlog → wycinka.log)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from app.core.config import Settings
from app.core.logging import configure_logging, get_logger

if TYPE_CHECKING:
    from pathlib import Path


def test_logging_when_prod_then_json_written_to_log_file(tmp_path: Path) -> None:
    log_file = tmp_path / "wycinka.log"
    settings = Settings(debug=False, log_file=log_file)

    configure_logging(settings)
    get_logger("wycinka.test").info("logging.file", key="value")

    assert log_file.exists()
    lines = [line for line in log_file.read_text(encoding="utf-8").splitlines() if line]
    record = json.loads(lines[-1])
    assert record["event"] == "logging.file"
    assert record["key"] == "value"
    assert record["level"] == "info"


def test_logging_when_prod_then_valid_json_per_line(tmp_path: Path) -> None:
    log_file = tmp_path / "nested" / "wycinka.log"
    settings = Settings(debug=False, log_file=log_file)

    configure_logging(settings)
    logger = get_logger("wycinka.test")
    logger.info("first")
    logger.warning("second")

    lines = [line for line in log_file.read_text(encoding="utf-8").splitlines() if line]
    events = [json.loads(line)["event"] for line in lines]
    assert events[-2:] == ["first", "second"]
