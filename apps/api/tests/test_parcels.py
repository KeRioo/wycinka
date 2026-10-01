from __future__ import annotations

from typing import Any

import pytest

pytestmark = pytest.mark.asyncio


async def test_get_parcel_by_point_returns_known_parcel(client: Any) -> None:
    response = await client.get("/api/v1/parcel?lat=52.2290&lng=21.0061")
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is True
    parcel = body["parcel"]
    assert parcel["teryt"] == "141201_1.0001.6501"
    assert parcel["voivodeship"] == "mazowieckie"
    assert parcel["commune"] == "Śródmieście"
    assert parcel["land_use"] == "Ls"
    assert parcel["geom"]["type"] == "Polygon"
    assert len(parcel["geom"]["coordinates"][0]) == 5


async def test_get_parcel_by_point_returns_not_found_when_outside(client: Any) -> None:
    response = await client.get("/api/v1/parcel?lat=49.0&lng=20.0")
    assert response.status_code == 200
    body = response.json()
    assert body["found"] is False


async def test_get_parcel_by_point_rejects_lat_out_of_range(client: Any) -> None:
    response = await client.get("/api/v1/parcel?lat=120&lng=21")
    assert response.status_code == 422


async def test_get_parcel_by_point_rejects_lng_out_of_range(client: Any) -> None:
    response = await client.get("/api/v1/parcel?lat=52&lng=-200")
    assert response.status_code == 422


async def test_get_parcel_by_point_returns_400_when_non_numeric(client: Any) -> None:
    response = await client.get("/api/v1/parcel?lat=abc&lng=21")
    assert response.status_code == 422


async def test_get_parcel_by_teryt_returns_known_parcel(client: Any) -> None:
    response = await client.get("/api/v1/parcel/141201_1.0001.6505")
    assert response.status_code == 200
    parcel = response.json()["parcel"]
    assert parcel["number"] == "6505"


async def test_get_parcel_by_teryt_returns_404_for_missing(client: Any) -> None:
    response = await client.get("/api/v1/parcel/141201_1.0001.9999")
    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "PARCEL_NOT_FOUND"


async def test_get_parcel_by_teryt_returns_422_for_invalid_format(client: Any) -> None:
    response = await client.get("/api/v1/parcel/not-a-teryt")
    assert response.status_code == 422


async def test_get_parcel_by_point_supports_all_sample_parcels(client: Any) -> None:
    for i in range(10):
        lat = 52.2290 + 0.0008 * i
        lng = 21.0060 + 0.0010 * i
        response = await client.get(f"/api/v1/parcel?lat={lat}&lng={lng}")
        assert response.status_code == 200
        body = response.json()
        assert body["found"] is True, f"parcel #{i} should be hit at ({lat}, {lng})"
