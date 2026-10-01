from __future__ import annotations

from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_pmtiles_without_range_returns_full_body(client: Any) -> None:
    response = await client.get("/api/v1/pmtiles/dzialki")
    assert response.status_code == 200
    assert response.headers.get("accept-ranges") == "bytes"
    assert response.headers.get("access-control-allow-origin") == "*"
    assert response.headers.get("content-type") == "application/octet-stream"
    assert response.headers.get("etag") is not None
    body = response.content
    assert len(body) == 16384  # 256 * 64 from fixture


async def test_pmtiles_with_byte_range_returns_206(client: Any) -> None:
    response = await client.get("/api/v1/pmtiles/dzialki", headers={"Range": "bytes=0-99"})
    assert response.status_code == 206
    assert response.headers.get("content-range") is not None
    cr = response.headers["content-range"]
    assert cr.startswith("bytes 0-99/")
    assert response.headers.get("accept-ranges") == "bytes"
    assert response.headers.get("access-control-allow-origin") == "*"
    assert len(response.content) == 100


async def test_pmtiles_with_open_range_returns_from_offset_to_end(client: Any) -> None:
    response = await client.get("/api/v1/pmtiles/dzialki", headers={"Range": "bytes=1000-"})
    assert response.status_code == 206
    cr = response.headers["content-range"]
    assert cr.startswith("bytes 1000-16383/16384")
    assert len(response.content) == 16384 - 1000


async def test_pmtiles_with_suffix_range_returns_last_n_bytes(client: Any) -> None:
    response = await client.get("/api/v1/pmtiles/dzialki", headers={"Range": "bytes=-512"})
    assert response.status_code == 206
    cr = response.headers["content-range"]
    assert cr.startswith("bytes 15872-16383/16384")
    assert len(response.content) == 512


async def test_pmtiles_etag_returns_304_when_match(client: Any) -> None:
    initial = await client.get("/api/v1/pmtiles/dzialki")
    etag = initial.headers["etag"]
    response = await client.get(
        "/api/v1/pmtiles/dzialki",
        headers={"If-None-Match": etag},
    )
    assert response.status_code == 304
    assert response.headers["etag"] == etag


async def test_pmtiles_returns_503_when_file_missing(
    client: Any,
    tmp_path: Any,
) -> None:
    settings = client._transport.app.state.settings
    settings.pmtiles_path = tmp_path / "missing.pmtiles"
    response = await client.get("/api/v1/pmtiles/dzialki")
    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "PMTILES_UNAVAILABLE"


async def test_pmtiles_returns_416_when_range_invalid(client: Any) -> None:
    response = await client.get(
        "/api/v1/pmtiles/dzialki",
        headers={"Range": "bytes=abc-def"},
    )
    assert response.status_code == 416


async def test_pmtiles_options_returns_cors_headers(client: Any) -> None:
    response = await client.options("/api/v1/pmtiles/dzialki")
    assert response.status_code == 204
    assert response.headers.get("access-control-allow-origin") == "*"
    assert "GET" in response.headers.get("access-control-allow-methods", "")
    assert "Range" in response.headers.get("access-control-allow-headers", "")
