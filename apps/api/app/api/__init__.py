from fastapi import APIRouter

from . import health, parcels, pmtiles, search

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(parcels.router, prefix="/api/v1", tags=["parcels"])
api_router.include_router(search.router, prefix="/api/v1", tags=["search"])
api_router.include_router(pmtiles.router, prefix="/api/v1", tags=["pmtiles"])
