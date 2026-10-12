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
    page_size: int = 5000
    max_parcels: int = 500_000
    max_result_bytes: int = 6_000_000_000

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
    wfs_url: str = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza"
    wfs_layer: str = "ms:dzialki"
    wfs_page_size: int = 5000
    raw_bytes_budget: int = 4_000_000_000
    use_wfs: bool = False
    powiat_list_url: str = (
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow"
    )
    gpkg_template: str = "https://opendata.geoportal.gov.pl/{teryt}/egib.gpkg"

    model_config = SettingsConfigDict(env_prefix="EGIB_SOURCES__")


class RetentionSettings(BaseSettings):
    backups_keep: int = 2

    model_config = SettingsConfigDict(env_prefix="EGIB_RETENTION__")


class KrajSettings(BaseSettings):
    """National (kraj) GeoParquet export — eziudp_wfs/PARQUET."""

    parquet_url: str = "https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/0_dzialki.parquet"
    parquet_voiv_template: str = "https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/{voiv}_dzialki.parquet"
    parquet_filename: str = "0_dzialki.parquet"
    read_batch_rows: int = 50_000
    sqlite_batch_rows: int = 50_000
    min_zoom: int = 12
    max_zoom: int = 16
    base_zoom: int = 15
    drop_densest: bool = True
    extend_zooms: bool = False
    layer_name: str = "dzialki"
    tippecanoe_path: str = "tippecanoe"
    pmtiles_convert_path: str = "pmtiles"
    download_chunk_size: int = 8_388_608

    model_config = SettingsConfigDict(env_prefix="EGIB_KRAJ__")


class Settings(BaseSettings):
    data_dir: Path = Path("./data")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    download: DownloadSettings = Field(default_factory=DownloadSettings)
    pmtiles: PmtilesSettings = Field(default_factory=PmtilesSettings)
    sqlite: SqliteSettings = Field(default_factory=SqliteSettings)
    sources: SourcesSettings = Field(default_factory=SourcesSettings)
    retention: RetentionSettings = Field(default_factory=RetentionSettings)
    kraj: KrajSettings = Field(default_factory=KrajSettings)

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

    @property
    def staging_dir(self) -> Path:
        return self.data_dir / "staging"

    @property
    def kraj_parquet_default_path(self) -> Path:
        return self.raw_dir / self.kraj.parquet_filename

    def ensure_dirs(self) -> None:
        for directory in (
            self.data_dir,
            self.raw_dir,
            self.work_dir,
            self.backups_dir,
            self.data_dir / "pmtiles",
            self.data_dir / "sqlite",
            self.staging_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
