from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables.

    All paths are resolved relative to the backend root (``apps/api``).
    Environment variables override defaults. In dev, a ``.env`` file in
    ``apps/api/`` is also honored.
    """

    model_config = SettingsConfigDict(
        env_file=os.environ.get("WYCINKA_ENV_FILE", ".env"),
        env_prefix="WYCINKA_",
        extra="ignore",
        case_sensitive=False,
    )

    api_version: str = Field(default="1.0.0", description="Semantic version of the API")
    debug: bool = Field(default=False, description="Enable verbose logging")

    db_path: Path = Field(
        default=Path("data/parcels.sqlite"),
        description="Path to the SQLite database with parcels and R-tree",
    )
    pmtiles_path: Path = Field(
        default=Path("data/pmtiles/dzialki.pmtiles"),
        description="Path to the PMTiles archive served via Range requests",
    )

    cors_allow_origins: str = Field(
        default="*",
        description="Comma separated list of allowed CORS origins",
    )

    max_parcels_in_aggregate: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of parcel ids accepted by /parcel/aggregate",
    )
    max_search_limit: int = Field(
        default=50,
        ge=1,
        le=200,
        description="Maximum value of the ``limit`` query param for /search",
    )
    max_search_query_length: int = Field(
        default=256,
        ge=1,
        description="Maximum length of the ``q`` query param for /search",
    )

    startup_check_grace_seconds: float = Field(
        default=0.0,
        ge=0.0,
        description="Skip db/pmtiles availability check for this many seconds after startup",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.cors_allow_origins.strip()
        if not raw or raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def db_path_resolved(self) -> Path:
        return Path(self.db_path).expanduser().resolve()

    @property
    def pmtiles_path_resolved(self) -> Path:
        return Path(self.pmtiles_path).expanduser().resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
