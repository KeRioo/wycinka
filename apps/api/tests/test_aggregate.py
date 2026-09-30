from __future__ import annotations

from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_aggregate_two_non_adjacent_parcels_returns_multi_polygon(client: Any) -> None:
    response = await client.get(
        "/api/v1/parcel/aggregate?id=141201_1.0001.6501,141201_1.0001.6510",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "MultiPolygon"
    assert body["area_m2"] > 0
    assert len(body["parcels"]) == 2


async def test_aggregate_single_parcel_returns_polygon(client: Any) -> None:
    response = await client.get("/api/v1/parcel/aggregate?id=141201_1.0001.6501")
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "Polygon"


async def test_aggregate_two_close_parcels_returns_shape(client: Any) -> None:
    response = await client.get(
        "/api/v1/parcel/aggregate?id=141201_1.0001.6501,141201_1.0001.6502",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] in {"Polygon", "MultiPolygon"}
    assert body["area_m2"] > 0


async def test_aggregate_unknown_parcel_returns_404(client: Any) -> None:
    response = await client.get("/api/v1/parcel/aggregate?id=141201_1.0001.9999")
    assert response.status_code == 404


async def test_aggregate_rejects_too_many_ids(client: Any) -> None:
    ids = ",".join(f"141201_1.0001.{6501 + i}" for i in range(21))
    response = await client.get(f"/api/v1/parcel/aggregate?id={ids}")
    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "BAD_REQUEST"


async def test_aggregate_rejects_invalid_teryt(client: Any) -> None:
    response = await client.get("/api/v1/parcel/aggregate?id=141201_1.0001.6501,not-a-teryt")
    assert response.status_code == 422


async def test_aggregate_rejects_empty_id(client: Any) -> None:
    response = await client.get("/api/v1/parcel/aggregate?id=")
    assert response.status_code == 400
