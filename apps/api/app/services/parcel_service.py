from __future__ import annotations

import sqlite3
from typing import TYPE_CHECKING, Any

from ..core.db import Database  # noqa: TC001  used as runtime type
from ..models.parcel import ParcelDetail
from .wkt_parser import (
    Ring,
    parse_wkt,
    point_in_geometry,
    polygon_area_m2,
    polygon_bbox,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

_FIELDS = (
    "id",
    "teryt",
    "number",
    "voivodeship",
    "voivodeship_code",
    "county",
    "county_code",
    "commune",
    "commune_code",
    "region",
    "region_name",
    "area_m2",
    "land_use",
    "geom_wkt",
    "centroid_lng",
    "centroid_lat",
    "bbox_min_lng",
    "bbox_min_lat",
    "bbox_max_lng",
    "bbox_max_lat",
    "fetched_at",
    "datasource",
)

_SELECT_COLUMNS = "p." + ", p.".join(_FIELDS)


class ParcelService:
    """High-level queries against the parcel database (R-tree-backed)."""

    def __init__(self, database: Database) -> None:
        self._db = database

    @property
    def db(self) -> Database:
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
        sql = f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt = ?"
        row = await self._db.fetch_one(sql, (teryt,))
        if row is None:
            return None
        geometry = self._geometry_from_row(row)
        return self._row_to_detail(row, geometry)

    async def get_many_by_teryt(self, teryt_list: Sequence[str]) -> list[ParcelDetail]:
        if not teryt_list:
            return []
        placeholders = ",".join("?" for _ in teryt_list)
        sql = f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt IN ({placeholders})"
        rows = await self._db.fetch_all(sql, tuple(teryt_list))
        details: list[ParcelDetail] = []
        for row in rows:
            geometry = self._geometry_from_row(row)
            details.append(self._row_to_detail(row, geometry))
        return details

    async def search(self, query: str, limit: int) -> list[dict[str, Any]]:
        like_pattern = f"{query}%"
        sql = (
            f"SELECT {_SELECT_COLUMNS} FROM parcels p WHERE p.teryt LIKE ? ORDER BY p.teryt LIMIT ?"
        )
        rows = await self._db.fetch_all(sql, (like_pattern, limit))
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
        sql = (
            f"SELECT {_SELECT_COLUMNS} "
            "FROM parcels p "
            "JOIN parcels_rtree_map m ON m.parcel_id = p.id "
            "JOIN parcels_rtree r ON r.id = m.rtree_id "
            "WHERE r.min_lng <= ? AND r.max_lng >= ? "
            "  AND r.min_lat <= ? AND r.max_lat >= ? "
            "ORDER BY p.area_m2 ASC"
        )
        return await self._db.fetch_all(sql, (lng, lng, lat, lat))

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
