from __future__ import annotations

from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_health_returns_ok_when_db_and_pmtiles_loaded(client: Any) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded", "down"}
    assert body["version"] == "1.0.0"
    assert "uptime_seconds" in body
    assert "db_loaded" in body
    assert "pmtiles_loaded" in body
    assert "data_freshness" in body
    assert body["db_loaded"] is True
    assert body["pmtiles_loaded"] is True


async def test_health_reports_degraded_when_pmtiles_missing(
    client: Any,
    tmp_path: Any,
) -> None:
    # Reuse fixture paths but blank out the pmtiles file.
    settings = client._transport.app.state.settings
    pmtiles = settings.pmtiles_path_resolved
    pmtiles.write_bytes(b"")
    response = await client.get("/health")
    body = response.json()
    assert response.status_code == 200
    assert body["db_loaded"] is True
    assert body["pmtiles_loaded"] is False
    assert body["status"] == "degraded"


async def test_health_includes_cors_headers(client: Any) -> None:
    response = await client.get("/health", headers={"Origin": "https://example.com"})
    assert response.status_code == 200
    assert "access-control-allow-origin" in {k.lower() for k in response.headers}


async def test_version_returns_metadata_when_called(client: Any) -> None:
    response = await client.get("/api/v1/version")
    assert response.status_code == 200
    body = response.json()
    assert body["api"] == "1.0.0"
    assert body["egib_source"] == "geoportal.gov.pl"
    assert body["data"] is not None
    assert body["data"].startswith("2026-09-29")
    assert body["etag"] is not None
