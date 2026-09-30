from __future__ import annotations

import re
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

TERYT_PATTERN = re.compile(r"^\d{6}_[1-5]\.\d{4}\.[0-9A-Za-z/\-.]+$")

TerytStr = Annotated[
    str,
    StringConstraints(
        min_length=14,
        max_length=64,
        pattern=TERYT_PATTERN.pattern,
    ),
]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ParcelGeometry(_Base):
    type: Annotated[str, Field(pattern="^(Polygon|MultiPolygon)$")]
    coordinates: list[Any]


class ParcelDetail(_Base):
    id: str
    teryt: str
    number: str
    voivodeship: str
    county: str
    commune: str
    region: str
    region_name: str | None = None
    area_m2: float = Field(ge=0.0)
    land_use: str | None = None
    geom: ParcelGeometry
    bbox: list[float] = Field(min_length=4, max_length=4)
    centroid: list[float] = Field(min_length=2, max_length=2)
    fetched_at: str
    datasource: str
    voivodeship_code: str
    county_code: str
    commune_code: str


class ParcelPointResponse(_Base):
    found: bool
    parcel: ParcelDetail | None = None
    nearby_parcels: list[dict[str, Any]] | None = None


class ParcelResponse(_Base):
    parcel: ParcelDetail


class ParcelNotFoundResponse(_Base):
    found: bool = False
    nearby_parcels: list[dict[str, Any]] = Field(default_factory=list)


class AggregateResponse(_Base):
    type: Annotated[str, Field(pattern="^(Polygon|MultiPolygon)$")]
    coordinates: list[Any]
    bbox: list[float]
    area_m2: float = Field(ge=0.0)
    parcels: list[str]


class SearchResultItem(_Base):
    id: str
    teryt: str
    label: str
    score: float | None = None


class SearchResponse(_Base):
    results: list[SearchResultItem]
    total: int


class VersionResponse(_Base):
    api: str
    data: str | None = None
    egib_source: str
    etag: str | None = None


class SyncMeta(_Base):
    key: str
    value: str
    updated_at: str


class ErrorResponse(_Base):
    error: str
    code: str
    details: dict[str, Any] = Field(default_factory=dict)
