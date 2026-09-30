from __future__ import annotations

from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_search_by_teryt_prefix_returns_results(client: Any) -> None:
    response = await client.get("/api/v1/search?q=141201_1.0001.650")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert all(item["teryt"].startswith("141201_1.0001.650") for item in body["results"])


async def test_search_by_short_prefix_returns_many(client: Any) -> None:
    response = await client.get("/api/v1/search?q=141201_1.0001")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 10


async def test_search_returns_label_with_region_and_commune(client: Any) -> None:
    response = await client.get("/api/v1/search?q=141201_1.0001.6501")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    first = body["results"][0]
    assert "Śródmieście" in first["label"]
    assert "141201_1.0001.6501" in first["label"]


async def test_search_empty_query_is_rejected(client: Any) -> None:
    response = await client.get("/api/v1/search?q=")
    assert response.status_code == 422


async def test_search_unknown_prefix_returns_empty(client: Any) -> None:
    response = await client.get("/api/v1/search?q=999999")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0


async def test_search_limit_caps_results(client: Any) -> None:
    response = await client.get("/api/v1/search?q=141201&limit=3")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] <= 3


async def test_search_rejects_invalid_limit(client: Any) -> None:
    response = await client.get("/api/v1/search?q=141201&limit=0")
    assert response.status_code == 422


async def test_search_rejects_query_too_long(client: Any) -> None:
    long_q = "x" * 300
    response = await client.get(f"/api/v1/search?q={long_q}")
    assert response.status_code == 400
