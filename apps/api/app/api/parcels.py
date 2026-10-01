from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query, Request

from ..models.parcel import (
    AggregateResponse,
    ErrorResponse,
    ParcelNotFoundResponse,
    ParcelPointResponse,
    ParcelResponse,
)
from ..services.parcel_service import ParcelService, build_aggregate_geometry
from ..services.wkt_parser import polygon_area_m2, polygon_bbox

router = APIRouter()

TERYT_PATTERN = re.compile(r"^\d{6}_[1-5]\.\d{4}\.[0-9A-Za-z/\-.]+$")


def _service(request: Request) -> ParcelService:
    service: ParcelService = request.app.state.parcel_service
    return service


def _bad_request(message: str, code: str = "BAD_REQUEST", **details: Any) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=ErrorResponse(error=message, code=code, details=dict(details)).model_dump(),
    )


def _not_found(message: str, **details: Any) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail=ErrorResponse(
            error=message,
            code="PARCEL_NOT_FOUND",
            details=dict(details),
        ).model_dump(),
    )


def _unprocessable(message: str, **details: Any) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=ErrorResponse(
            error=message,
            code="INVALID_TERYT",
            details=dict(details),
        ).model_dump(),
    )


def _db_unavailable(details: dict[str, Any] | None = None) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=ErrorResponse(
            error="Database is not available",
            code="DB_UNAVAILABLE",
            details=details or {},
        ).model_dump(),
    )


def _parse_id_list(raw: str, *, maximum: int) -> list[str]:
    if not raw:
        raise _bad_request("Query parameter 'id' is required", empty=True)
    parts = [piece.strip() for piece in raw.split(",") if piece.strip()]
    if not parts:
        raise _bad_request("Query parameter 'id' must contain at least one TERYT", empty=True)
    if len(parts) > maximum:
        raise _bad_request(
            f"Too many parcel ids (max {maximum})",
            code="BAD_REQUEST",
            count=len(parts),
            maximum=maximum,
        )
    for teryt in parts:
        if not TERYT_PATTERN.match(teryt):
            raise _unprocessable(
                f"Invalid TERYT format: {teryt!r}",
                teryt=teryt,
                expected_pattern=TERYT_PATTERN.pattern,
            )
    return parts


@router.get(
    "/parcel",
    response_model=ParcelPointResponse,
    responses={
        400: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_parcel_by_point(
    request: Request,
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
) -> ParcelPointResponse:
    db = request.app.state.db
    if not db.path.exists():
        return ParcelPointResponse(found=False, nearby_parcels=[])

    try:
        service = _service(request)
        detail = await service.get_by_point(lat, lng)
    except (OSError, RuntimeError) as exc:
        raise _db_unavailable({"reason": str(exc)}) from exc

    if detail is None:
        return ParcelPointResponse(found=False, nearby_parcels=[])

    return ParcelPointResponse(found=True, parcel=detail)


@router.get(
    "/parcel/aggregate",
    response_model=AggregateResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def aggregate_parcels(
    request: Request,
    id: str = Query(..., description="Comma separated list of TERYT ids"),
) -> AggregateResponse:
    db_settings = request.app.state.settings
    maximum = db_settings.max_parcels_in_aggregate
    teryt_list = _parse_id_list(id, maximum=maximum)

    service = _service(request)
    if not request.app.state.db.path.exists():
        raise _db_unavailable()

    details = await service.get_many_by_teryt(teryt_list)
    if not details:
        raise _not_found("No parcels found for the given ids", ids=teryt_list)

    geometry = build_aggregate_geometry(details)
    if geometry is None:
        raise _not_found("Aggregated geometry is empty", ids=teryt_list)

    area = polygon_area_m2(geometry)
    bbox = polygon_bbox(geometry)
    return AggregateResponse(
        type=geometry["type"],
        coordinates=geometry["coordinates"],
        bbox=bbox,
        area_m2=area,
        parcels=[detail.teryt for detail in details],
    )


@router.get(
    "/parcel/{teryt}",
    response_model=ParcelResponse,
    responses={
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_parcel_by_teryt(
    request: Request,
    teryt: str = Path(..., min_length=14, max_length=64),
) -> ParcelResponse:
    if not TERYT_PATTERN.match(teryt):
        raise _unprocessable(
            f"Invalid TERYT format: {teryt!r}",
            teryt=teryt,
            expected_pattern=TERYT_PATTERN.pattern,
        )

    if not request.app.state.db.path.exists():
        raise _db_unavailable()

    service = _service(request)
    detail = await service.get_by_teryt(teryt)
    if detail is None:
        raise _not_found(f"Parcel not found for TERYT {teryt}", teryt=teryt)

    return ParcelResponse(parcel=detail)


__all__ = ["ParcelNotFoundResponse", "router"]
