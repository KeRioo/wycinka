from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.parcel import ErrorResponse, SearchResponse, SearchResultItem

if TYPE_CHECKING:
    from ..services.parcel_service import ParcelService

router = APIRouter()


def _bad_request(message: str, **details: object) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=ErrorResponse(error=message, code="BAD_REQUEST", details=dict(details)).model_dump(),
    )


@router.get(
    "/search",
    response_model=SearchResponse,
    responses={
        400: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def search(
    request: Request,
    q: str = Query(..., min_length=1, description="TERYT prefix or 'name number'"),
    limit: int = Query(10, ge=1, le=50),
) -> SearchResponse:
    settings = request.app.state.settings

    if len(q) > settings.max_search_query_length:
        raise _bad_request(
            "Query string too long",
            length=len(q),
            maximum=settings.max_search_query_length,
        )

    if not request.app.state.db.path.exists():
        return SearchResponse(results=[], total=0)

    service: ParcelService = request.app.state.parcel_service
    raw_results = await service.search(q, limit)

    items = [
        SearchResultItem(
            id=item["id"],
            teryt=item["teryt"],
            label=item["label"],
        )
        for item in raw_results
    ]

    return SearchResponse(results=items, total=len(items))


__all__ = ["router"]
