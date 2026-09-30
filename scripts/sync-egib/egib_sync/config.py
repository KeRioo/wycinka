"""Configuration loaded from environment / .env file."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DownloadSettings(BaseSettings):
    concurrency: int = 10
    timeout_seconds: float = 30.0
    max_retries: int = 3
    backoff_base_seconds: float = 1.0
    backoff_max_seconds: float = 60.0

    model_config = SettingsConfigDict(env_prefix="EGIB_DOWNLOAD__")


class PmtilesSettings(BaseSettings):
    tippecanoe_path: str = "tippecanoe"
    min_zoom: int = 4
    max_zoom: int = 18
    base_zoom: int = 14
    drop_densest: bool = True
    extend_zooms: bool = True
    layer_name: str = "dzialki"

    model_config = SettingsConfigDict(env_prefix="EGIB_PMTILES__")


class SqliteSettings(BaseSettings):
    batch_size: int = 1000

    model_config = SettingsConfigDict(env_prefix="EGIB_SQLITE__")


class SourcesSettings(BaseSettings):
    powiat_list_url: str = (
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
    )
    gpkg_template: str = "https://opendata.geoportal.gov.pl/{teryt}/egib.gpkg"

    model_config = SettingsConfigDict(env_prefix="EGIB_SOURCES__")


class RetentionSettings(BaseSettings):
    backups_keep: int = 2

    model_config = SettingsConfigDict(env_prefix="EGIB_RETENTION__")


class Settings(BaseSettings):
    data_dir: Path = Path("./data")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    download: DownloadSettings = Field(default_factory=DownloadSettings)
    pmtiles: PmtilesSettings = Field(default_factory=PmtilesSettings)
    sqlite: SqliteSettings = Field(default_factory=SqliteSettings)
    sources: SourcesSettings = Field(default_factory=SourcesSettings)
    retention: RetentionSettings = Field(default_factory=RetentionSettings)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "egib-raw"

    @property
    def work_dir(self) -> Path:
        return self.data_dir / "work"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def pmtiles_path(self) -> Path:
        return self.data_dir / "pmtiles" / "dzialki.pmtiles"

    @property
    def sqlite_path(self) -> Path:
        return self.data_dir / "sqlite" / "parcels.sqlite"

    @property
    def merged_path(self) -> Path:
        return self.work_dir / "merged.gpkg"

    def ensure_dirs(self) -> None:
        for directory in (
            self.data_dir,
            self.raw_dir,
            self.work_dir,
            self.backups_dir,
            self.data_dir / "pmtiles",
            self.data_dir / "sqlite",
        ):
            directory.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()