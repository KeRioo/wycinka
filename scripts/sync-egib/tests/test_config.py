"""Tests for configuration loading and defaults."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from egib_sync.config import (
    DownloadSettings,
    PmtilesSettings,
    RetentionSettings,
    Settings,
    SourcesSettings,
    SqliteSettings,
    get_settings,
)


def test_settings_when_default_then_has_sensible_values() -> None:
    s = Settings()
    assert s.log_level == "INFO"
    assert s.log_json is True
    assert s.data_dir == Path("./data")


def test_settings_when_data_dir_provided_then_uses_it(tmp_path: Path) -> None:
    s = Settings(data_dir=tmp_path)
    assert s.data_dir == tmp_path


def test_settings_dir_properties_when_called_then_point_under_data_dir() -> None:
    s = Settings(data_dir=Path("/tmp/data"))
    assert s.raw_dir == Path("/tmp/data/egib-raw")
    assert s.work_dir == Path("/tmp/data/work")
    assert s.backups_dir == Path("/tmp/data/backups")
    assert s.pmtiles_path == Path("/tmp/data/pmtiles/dzialki.pmtiles")
    assert s.sqlite_path == Path("/tmp/data/sqlite/parcels.sqlite")
    assert s.merged_path == Path("/tmp/data/work/merged.gpkg")


def test_settings_ensure_dirs_when_called_then_creates_all(tmp_path: Path) -> None:
    s = Settings(data_dir=tmp_path)
    s.ensure_dirs()
    for p in (
        s.data_dir,
        s.raw_dir,
        s.work_dir,
        s.backups_dir,
        s.data_dir / "pmtiles",
        s.data_dir / "sqlite",
    ):
        assert p.exists()
        assert p.is_dir()


def test_settings_when_log_level_invalid_then_raises() -> None:
    with pytest.raises(ValidationError):
        Settings(log_level="NOTALEVEL")


def test_settings_nested_download_settings_when_provided_then_used() -> None:
    s = Settings(download=DownloadSettings(concurrency=42))
    assert s.download.concurrency == 42
    assert s.download.timeout_seconds == 30.0


def test_settings_when_env_prefix_used_then_resolves(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EGIB_DOWNLOAD__CONCURRENCY", "7")
    monkeypatch.setenv("EGIB_PMTILES__MIN_ZOOM", "5")
    s = Settings()
    assert s.download.concurrency == 7
    assert s.pmtiles.min_zoom == 5


def test_download_settings_when_defaults_then_match_docstring() -> None:
    s = DownloadSettings()
    assert s.max_retries == 3
    assert s.backoff_base_seconds == 1.0
    assert s.backoff_max_seconds == 60.0


def test_pmtiles_settings_when_defaults_then_match_docstring() -> None:
    s = PmtilesSettings()
    assert s.min_zoom == 4
    assert s.max_zoom == 18
    assert s.base_zoom == 14
    assert s.layer_name == "dzialki"
    assert s.drop_densest is True


def test_sqlite_settings_when_default_then_batch_size_1000() -> None:
    assert SqliteSettings().batch_size == 1000


def test_sources_settings_when_default_then_has_template() -> None:
    s = SourcesSettings()
    assert "{teryt}" in s.gpkg_template
    assert "integracja.gugik" in s.powiat_list_url


def test_retention_settings_when_default_then_keeps_2_backups() -> None:
    assert RetentionSettings().backups_keep == 2


def test_get_settings_when_called_then_returns_settings_instance() -> None:
    s = get_settings()
    assert isinstance(s, Settings)
