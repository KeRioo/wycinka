from __future__ import annotations

import sqlite3
from typing import TYPE_CHECKING, Any

from ..models.parcel import ParcelDetail
from .wkt_parser import Ring, parse_wkt, point_in_geometry, polygon_area_m2, polygon_bbox

if TYPE_CHECKING:
    from collections.abc import Sequence

    from ..core.storage import ParcelStorage


class ParcelService:
    """High-level queries against the parcel storage backend (SQLite R-tree or PostGIS)."""

    def __init__(self, database: ParcelStorage) -> None:
        self._db = database

    @property
    def db(self) -> ParcelStorage:
        return self._db

    async def get_by_point(self, lat: float, lng: float) -> ParcelDetail | None:
        candidates = await self._candidates_for_point(lat, lng)
        for row in candidates:
            geometry = self._geometry_from_row(row)
            try:
                if point_in_geometry((lng, lat), geometry):
                    return self._row_to_detail(row, geometry)
            except ValueError:
                continue
        return None

    async def get_by_teryt(self, teryt: str) -> ParcelDetail | None:
        row = await self._db.get_by_teryt(teryt)
        if row is None:
            return None
        geometry = self._geometry_from_row(row)
        return self._row_to_detail(row, geometry)

    async def get_many_by_teryt(self, teryt_list: Sequence[str]) -> list[ParcelDetail]:
        if not teryt_list:
            return []
        rows = await self._db.get_many_by_teryt(teryt_list)
        details: list[ParcelDetail] = []
        for row in rows:
            geometry = self._geometry_from_row(row)
            details.append(self._row_to_detail(row, geometry))
        return details

    async def search(self, query: str, limit: int) -> list[dict[str, Any]]:
        rows = await self._db.search_teryt_prefix(query, limit)
        results: list[dict[str, Any]] = []
        for row in rows:
            teryt_value = str(row["teryt"])
            region_label = row["region_name"] or ("Obręb " + str(row["region"]))
            label = f"{teryt_value} — {region_label}, {row['commune']}"
            results.append(
                {
                    "id": str(row["id"]),
                    "teryt": teryt_value,
                    "label": label,
                }
            )
        return results

    async def _candidates_for_point(self, lat: float, lng: float) -> list[Any]:
        return list(await self._db.get_point_candidates(lat, lng))

    @staticmethod
    def _geometry_from_row(row: Any) -> dict[str, Any]:
        wkt_value = str(row["geom_wkt"])
        return parse_wkt(wkt_value)

    def _row_to_detail(self, row: Any, geometry: dict[str, Any]) -> ParcelDetail:
        bbox = polygon_bbox(geometry)
        centroid = [float(row["centroid_lng"]), float(row["centroid_lat"])]
        area = self._coerce_area(row, geometry)
        return ParcelDetail(
            id=str(row["id"]),
            teryt=str(row["teryt"]),
            number=str(row["number"]),
            voivodeship=str(row["voivodeship"]),
            voivodeship_code=str(row["voivodeship_code"]),
            county=str(row["county"]),
            county_code=str(row["county_code"]),
            commune=str(row["commune"]),
            commune_code=str(row["commune_code"]),
            region=str(row["region"]),
            region_name=row["region_name"],
            area_m2=area,
            land_use=row["land_use"],
            geom={"type": geometry["type"], "coordinates": geometry["coordinates"]},
            bbox=bbox,
            centroid=centroid,
            fetched_at=str(row["fetched_at"]),
            datasource=str(row["datasource"]),
        )

    @staticmethod
    def _coerce_area(row: Any, geometry: dict[str, Any]) -> float:
        raw_area = row["area_m2"]
        if raw_area is None:
            return polygon_area_m2(geometry)
        try:
            value = float(raw_area)
        except (TypeError, ValueError):
            return polygon_area_m2(geometry)
        if value <= 0:
            return polygon_area_m2(geometry)
        return value


def build_aggregate_geometry(details: Sequence[ParcelDetail]) -> dict[str, Any] | None:
    """Combine geometries from selected parcels into a Polygon or MultiPolygon."""
    if not details:
        return None

    polygons: list[list[Ring]] = []
    for detail in details:
        coords = detail.geom.coordinates
        if detail.geom.type == "Polygon":
            polygons.append(_to_rings(coords))
        elif detail.geom.type == "MultiPolygon":
            for polygon in coords:
                polygons.append(_to_rings(polygon))
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def _to_rings(coords: Any) -> list[Ring]:
    rings: list[Ring] = []
    for ring_coords in coords:
        ring: Ring = [(float(lng), float(lat)) for lng, lat in ring_coords]
        rings.append(ring)
    return rings


def sqlite_supports_rtree() -> bool:
    """Detect R-tree support on the running SQLite (mainly for diagnostics/tests)."""
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(":memory:")
        conn.execute(
            "CREATE VIRTUAL TABLE rtree_test USING rtree(id, minX, maxX, minY, maxY)",
        )
        conn.execute("DROP TABLE rtree_test")
        return True
    except sqlite3.OperationalError:
        return False
    finally:
        if conn is not None:
            conn.close()
