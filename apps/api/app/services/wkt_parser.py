"""Minimal WKT (Well-Known Text) parser focused on EGiB parcel data.

Supports:
- ``POINT (x y)``
- ``POLYGON ((x1 y1, x2 y2, ...))``
- ``POLYGON ((outer), (hole1), (hole2))``
- ``MULTIPOLYGON (((x y, ...)), ((x y, ...), (hole)))``

Coordinates are interpreted as ``(lng, lat)`` in WGS84 (EPSG:4326),
matching the GeoJSON specification (``coordinates`` are ``[lng, lat]``).

Public API:
- :func:`parse_wkt` — parse WKT text and return a GeoJSON dict.
- :func:`point_in_polygon` — ray casting for one ring.
- :func:`polygon_area_m2` — geodesic area for a (Multi)Polygon on the
  WGS84 ellipsoid (WGS84 mean radius approximation).
- :func:`polygon_bbox` — ``[min_lng, min_lat, max_lng, max_lat]``.
"""

from __future__ import annotations

import math
import re
from typing import TYPE_CHECKING, Any, Final

if TYPE_CHECKING:
    from collections.abc import Sequence

Point = tuple[float, float]
Ring = list[Point]
PolygonRings = list[Ring]
MultiPolygon = list[PolygonRings]

WGS84_MEAN_RADIUS_M: Final[float] = 6371008.8


class WKTError(ValueError):
    """Raised when WKT cannot be parsed or is malformed."""


_HEADER_RE = re.compile(
    r"^\s*(POINT|POLYGON|MULTIPOLYGON)\s*\((.*)\)\s*$", re.IGNORECASE | re.DOTALL
)
_NUMBER_RE = re.compile(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")


def parse_wkt(text: str) -> dict[str, Any]:
    """Parse WKT text and return a GeoJSON geometry dict.

    :raises WKTError: when ``text`` is not a supported geometry or is malformed.
    """
    if not isinstance(text, str):
        raise WKTError("WKT must be a string")

    header_match = _HEADER_RE.match(text)
    if header_match is None:
        raise WKTError(f"Unsupported or malformed WKT: {text!r}")

    geometry_type = header_match.group(1).upper()
    body = header_match.group(2)

    if geometry_type == "POINT":
        coords = _parse_numbers(body)
        if len(coords) != 2:
            raise WKTError(f"POINT requires exactly 2 numbers, got {len(coords)}")
        return {"type": "Point", "coordinates": [coords[0], coords[1]]}

    if geometry_type == "POLYGON":
        rings = _parse_rings(body)
        return _polygon_to_geojson(rings)

    if geometry_type == "MULTIPOLYGON":
        polygons = _parse_multipolygon(body)
        return {
            "type": "MultiPolygon",
            "coordinates": [
                _polygon_rings_to_geojson(polygon)["coordinates"] for polygon in polygons
            ],
        }

    raise WKTError(f"Unsupported geometry type: {geometry_type}")


def _parse_numbers(blob: str) -> list[float]:
    blob = blob.strip()
    if not blob:
        raise WKTError("Empty coordinate list")
    raw_tokens = _split_top_level(blob)
    if len(raw_tokens) == 1 and "," in raw_tokens[0]:
        raw_tokens = list(raw_tokens[0].split(","))
    numbers: list[float] = []
    for token in raw_tokens:
        match = _NUMBER_RE.fullmatch(token.strip())
        if not match:
            raise WKTError(f"Invalid number token: {token!r}")
        numbers.append(float(match.group(0)))
    return numbers


def _parse_rings(blob: str) -> PolygonRings:
    blob = blob.strip()
    if not blob:
        raise WKTError("Empty polygon body")

    segments = _split_paren_segments(blob)
    if not segments:
        raise WKTError("Polygon body must contain at least one ring")

    rings: PolygonRings = []
    for segment in segments:
        rings.append(_parse_ring(segment))
    return rings


def _parse_multipolygon(blob: str) -> MultiPolygon:
    blob = blob.strip()
    if not blob:
        raise WKTError("Empty multipolygon body")

    polygons_raw: list[str] = []
    depth = 0
    current: list[str] = []
    for char in blob:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
            if depth == 0:
                polygons_raw.append("".join(current))
                current = []
        elif char == "," and depth == 0:
            continue
        else:
            current.append(char)
    if depth != 0:
        raise WKTError("Unbalanced parentheses in MULTIPOLYGON")
    if current:
        polygons_raw.append("".join(current))
    return [_parse_rings(polygon_blob) for polygon_blob in polygons_raw]


def _polygon_rings_to_geojson(rings: PolygonRings) -> dict[str, Any]:
    if not rings:
        raise WKTError("Polygon must have at least one ring")
    _validate_rings(rings)
    return {"type": "Polygon", "coordinates": rings}


def _polygon_to_geojson(rings: PolygonRings) -> dict[str, Any]:
    if not rings:
        raise WKTError("Polygon must have at least one ring")
    _validate_rings(rings)
    return {"type": "Polygon", "coordinates": rings}


def _validate_rings(rings: PolygonRings) -> None:
    outer = rings[0]
    if len(outer) < 4:
        raise WKTError("Polygon outer ring must have at least 4 positions (closed)")
    if outer[0] != outer[-1]:
        raise WKTError("Polygon outer ring must be closed (first point equals last)")
    if not _ring_is_counter_clockwise(outer):
        raise WKTError("Polygon outer ring must be counter-clockwise (GeoJSON RFC 7946)")
    for index, hole in enumerate(rings[1:], start=1):
        if len(hole) < 4:
            raise WKTError(f"Hole {index} must have at least 4 positions")
        if hole[0] != hole[-1]:
            raise WKTError(f"Hole {index} must be closed (first point equals last)")
        if not _ring_is_clockwise(hole):
            raise WKTError(f"Hole {index} must be clockwise (opposite of outer)")


def _parse_ring(ring_blob: str) -> Ring:
    ring_blob = ring_blob.strip()
    if not (ring_blob.startswith("(") and ring_blob.endswith(")")):
        raise WKTError(f"Ring must be wrapped in parentheses: {ring_blob!r}")
    inner = ring_blob[1:-1].strip()
    if not inner:
        raise WKTError("Ring body is empty")

    numbers = _parse_numbers(inner)
    if len(numbers) % 2 != 0:
        raise WKTError("Ring must contain pairs of coordinates")

    points: Ring = []
    for index in range(0, len(numbers), 2):
        points.append((numbers[index], numbers[index + 1]))
    return points


def _split_paren_segments(blob: str) -> list[str]:
    segments: list[str] = []
    depth = 0
    current: list[str] = []
    for char in blob:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
            if depth == 0:
                segment = "".join(current).strip()
                if segment:
                    segments.append(segment)
                current = []
        elif char == "," and depth == 1:
            segments.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    if depth != 0:
        raise WKTError("Unbalanced parentheses while parsing polygon")
    leftover = "".join(current).strip()
    if leftover:
        segments.append(leftover)
    return segments


def _split_top_level(blob: str, separator: str = ",") -> list[str]:
    pieces: list[str] = []
    depth = 0
    current: list[str] = []
    for char in blob:
        if char == "(":
            depth += 1
            current.append(char)
        elif char == ")":
            depth -= 1
            current.append(char)
        elif char == separator and depth == 0:
            pieces.append("".join(current).strip())
            current = []
        else:
            current.append(char)
    tail = "".join(current).strip()
    if tail:
        pieces.append(tail)
    return pieces


def _signed_area(points: Sequence[Point]) -> float:
    if len(points) < 3:
        return 0.0
    total = 0.0
    for index in range(len(points) - 1):
        x1, y1 = points[index]
        x2, y2 = points[index + 1]
        total += (x2 - x1) * (y2 + y1)
    return total / 2.0


def _ring_is_clockwise(points: Sequence[Point]) -> bool:
    return _signed_area(points) < 0.0


def _ring_is_counter_clockwise(points: Sequence[Point]) -> bool:
    return _signed_area(points) > 0.0


def ring_area_signed(points: Sequence[Point]) -> float:
    """Signed 2D area of a ring (positive = CCW, negative = CW)."""
    return _signed_area(points)


def point_in_polygon(point: Point, ring: Sequence[Point]) -> bool:
    """Ray casting point-in-polygon test for a single ring."""
    if len(ring) < 3:
        return False

    x, y = point
    inside = False
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        if (y1 > y) == (y2 > y):
            continue
        x_intersect = (x2 - x1) * (y - y1) / (y2 - y1) + x1
        if x_intersect > x:
            inside = not inside
    return inside


def point_in_geometry(point: Point, geometry: dict[str, Any]) -> bool:
    """Test whether ``point`` lies inside ``geometry`` (Polygon / MultiPolygon)."""
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        return _point_in_polygon_geometry(point, geometry.get("coordinates", []))
    if geometry_type == "MultiPolygon":
        for polygon in geometry.get("coordinates", []):
            if _point_in_polygon_geometry(point, polygon):
                return True
        return False
    raise WKTError(f"Cannot test point-in-geometry for type {geometry_type!r}")


def _point_in_polygon_geometry(point: Point, rings: list[list[Point]]) -> bool:
    if not rings:
        return False
    if not point_in_polygon(point, rings[0]):
        return False
    return all(not point_in_polygon(point, hole) for hole in rings[1:])


def polygon_bbox(geometry: dict[str, Any]) -> list[float]:
    """Return ``[min_lng, min_lat, max_lng, max_lat]`` for Polygon/MultiPolygon."""
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        rings: list[list[Point]] = geometry.get("coordinates", [])
    elif geometry_type == "MultiPolygon":
        rings = [ring for polygon in geometry.get("coordinates", []) for ring in polygon]
    else:
        raise WKTError(f"Cannot compute bbox for type {geometry_type!r}")

    min_lng = min_lat = math.inf
    max_lng = max_lat = -math.inf
    for ring in rings:
        for lng, lat in ring:
            min_lng = min(min_lng, lng)
            max_lng = max(max_lng, lng)
            min_lat = min(min_lat, lat)
            max_lat = max(max_lat, lat)
    if math.isinf(min_lng) or math.isinf(min_lat):
        raise WKTError("Geometry has no coordinates")
    return [min_lng, min_lat, max_lng, max_lat]


def polygon_area_m2(geometry: dict[str, Any]) -> float:
    """Approximate geodesic area in m^2 using a spherical excess formula.

    Uses the authalic sphere approximation: area per degree^2 depends on
    latitude. Adequate for parcel-scale geometries (< few km).
    """
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        polygons: list[list[list[Point]]] = [geometry.get("coordinates", [])]
    elif geometry_type == "MultiPolygon":
        polygons = geometry.get("coordinates", [])
    else:
        raise WKTError(f"Cannot compute area for type {geometry_type!r}")

    total = 0.0
    for polygon in polygons:
        total += _polygon_spherical_area(polygon)
    return abs(total)


def _polygon_spherical_area(rings: list[list[Point]]) -> float:
    if not rings:
        return 0.0
    outer = rings[0]
    area = _ring_spherical_area(outer)
    for hole in rings[1:]:
        area -= _ring_spherical_area(hole)
    return area


def _ring_spherical_area(ring: Sequence[Point]) -> float:
    if len(ring) < 4:
        return 0.0
    total = 0.0
    for index in range(len(ring) - 1):
        lng1, lat1 = ring[index]
        lng2, lat2 = ring[index + 1]
        total += math.radians(lng2 - lng1) * (
            2.0 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
        )
    return total * (WGS84_MEAN_RADIUS_M**2) / 2.0


def geometry_centroid(geometry: dict[str, Any]) -> list[float]:
    """Return ``[centroid_lng, centroid_lat]`` for Polygon/MultiPolygon."""
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        rings: list[list[Point]] = geometry.get("coordinates", [])
    elif geometry_type == "MultiPolygon":
        rings = [ring for polygon in geometry.get("coordinates", []) for ring in polygon]
    else:
        raise WKTError(f"Cannot compute centroid for type {geometry_type!r}")
    if not rings:
        raise WKTError("Geometry has no coordinates")

    sum_lng = 0.0
    sum_lat = 0.0
    count = 0
    for ring in rings:
        for lng, lat in ring:
            sum_lng += lng
            sum_lat += lat
            count += 1
    return [sum_lng / count, sum_lat / count]
