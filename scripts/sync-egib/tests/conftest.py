"""Shared pytest fixtures for egib_sync tests."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
import respx
from httpx import Response

from egib_sync.config import Settings


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR


@pytest.fixture
def tmp_data_dir(tmp_path: Path) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    return data


@pytest.fixture
def settings(tmp_data_dir: Path) -> Settings:
    return Settings(data_dir=tmp_data_dir, log_json=False, log_level="DEBUG")


@pytest.fixture
def mock_powiat_list() -> list[dict[str, Any]]:
    """10 syntetycznych powiatów z TERYT i URL — realistic but synthetic."""
    voivodeships = ["14", "22", "30", "04", "12"]
    out: list[dict[str, Any]] = []
    for idx, w in enumerate(voivodeships * 2):
        teryt = f"{w}{idx:02d}"
        out.append(
            {
                "teryt": teryt,
                "name": f"Powiat {idx}",
                "url": f"https://example.com/egib/{teryt}.gpkg",
                "size_bytes": 1024 * (idx + 1),
                "etag": f"etag-{teryt}",
            }
        )
    return out[:10]


@pytest.fixture
def powiat_list_file(tmp_path: Path, mock_powiat_list: list[dict[str, Any]]) -> Path:
    p = tmp_path / "powiat_list.json"
    p.write_text(json.dumps(mock_powiat_list), encoding="utf-8")
    return p


@pytest.fixture
def sample_parcels_json(fixtures_dir: Path) -> dict[str, Any]:
    p = fixtures_dir / "sample_parcels.json"
    if not p.exists():
        return _generate_sample_parcels()
    return json.loads(p.read_text(encoding="utf-8"))


def _generate_sample_parcels() -> dict[str, Any]:
    parcels: list[dict[str, Any]] = []
    base_lng, base_lat = 21.0, 52.0
    for i in range(10):
        x = base_lng + i * 0.01
        y = base_lat + i * 0.01
        parcels.append(
            {
                "id": f"14120{i % 5 + 1}_1.000{i + 1}.{6500 + i}",
                "teryt": f"14120{i % 5 + 1}_1.000{i + 1}.{6500 + i}",
                "number": str(6500 + i),
                "voivodeship": "mazowieckie",
                "voivodeship_code": "14",
                "county": "Warszawa",
                "county_code": f"120{i % 5 + 1}",
                "commune": "Warszawa",
                "commune_code": f"14120{i % 5 + 1}",
                "region": f"000{i + 1}",
                "region_name": f"Obreb {i + 1}",
                "area_m2": 1500.0 + i * 100,
                "land_use": "Ls",
                "geom_wkt": (
                    f"POLYGON (({x} {y}, {x + 0.005} {y}, "
                    f"{x + 0.005} {y + 0.005}, {x} {y + 0.005}, {x} {y}))"
                ),
                "centroid_lng": x + 0.0025,
                "centroid_lat": y + 0.0025,
                "bbox_min_lng": x,
                "bbox_min_lat": y,
                "bbox_max_lng": x + 0.005,
                "bbox_max_lat": y + 0.005,
                "fetched_at": "2026-09-29T03:00:00Z",
                "datasource": "geoportal.gov.pl",
            }
        )
    return {"parcels": parcels, "etag": "test-etag-001"}


@pytest.fixture
def write_sample_parcels(fixtures_dir: Path) -> Any:
    def _write() -> Path:
        p = fixtures_dir / "sample_parcels.json"
        p.write_text(json.dumps(_generate_sample_parcels()), encoding="utf-8")
        return p

    return _write


@pytest.fixture
def respx_mock():
    with respx.mock(assert_all_called=False) as router:
        yield router


@pytest.fixture
def fake_gpkg_bytes() -> bytes:
    """Minimal GPKG-like bytes (not a real GPKG, just non-empty)."""
    return b"PK\x03\x04" + b"\x00" * 256 + b"GPKG-FAKE-CONTENT"


def make_ok_response(content: bytes = b"OK", status_code: int = 200) -> Response:
    return Response(status_code=status_code, content=content)


def make_error_response(status_code: int = 500, content: bytes = b"Server Error") -> Response:
    return Response(status_code=status_code, content=content)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()