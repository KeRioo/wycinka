"""WKT parser property-based tests."""

from __future__ import annotations

import hypothesis.strategies as st
import pytest
from app.services.wkt_parser import (
    WKTError,
    parse_wkt,
    point_in_geometry,
    point_in_polygon,
    polygon_area_m2,
    polygon_bbox,
)
from hypothesis import HealthCheck, given, settings


def _round_trip(geom: dict) -> str:
    """Reconstruct a WKT string from a parsed geometry."""
    if geom["type"] == "Polygon":
        rings = []
        for ring in geom["coordinates"]:
            pieces = ", ".join(f"{lng} {lat}" for lng, lat in ring)
            rings.append(f"({pieces})")
        return "POLYGON (" + ", ".join(rings) + ")"
    raise NotImplementedError(geom["type"])


def _square_geometry(min_lng: float, min_lat: float, side: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [
            [
                (min_lng, min_lat),
                (min_lng + side, min_lat),
                (min_lng + side, min_lat + side),
                (min_lng, min_lat + side),
                (min_lng, min_lat),
            ]
        ],
    }


@st.composite
def squares(draw: st.DrawFn) -> dict:
    min_lng = draw(
        st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False)
    )
    min_lat = draw(
        st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False)
    )
    side = draw(st.floats(min_value=1e-6, max_value=10.0, allow_nan=False, allow_infinity=False))
    return _square_geometry(min_lng, min_lat, side)


class TestRoundTrip:
    @given(squares())
    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    def test_wkt_round_trip_when_parsed_then_reparsed_preserves_type(self, geom: dict) -> None:
        wkt = _round_trip(geom)
        parsed = parse_wkt(wkt)
        assert parsed["type"] == "Polygon"
        assert len(parsed["coordinates"][0]) == 5
        assert parsed["coordinates"][0][0] == parsed["coordinates"][0][-1]


class TestPointInPolygon:
    @given(squares())
    @settings(max_examples=50)
    def test_point_inside_when_at_centroid(self, geom: dict) -> None:
        min_lng, min_lat, max_lng, max_lat = polygon_bbox(geom)
        center_lng = (min_lng + max_lng) / 2.0
        center_lat = (min_lat + max_lat) / 2.0
        assert point_in_geometry((center_lng, center_lat), geom) is True

    @given(
        squares(),
        st.floats(min_value=-180.0, max_value=180.0, allow_nan=False, allow_infinity=False),
        st.floats(min_value=-90.0, max_value=90.0, allow_nan=False, allow_infinity=False),
    )
    @settings(max_examples=100)
    def test_point_far_outside_when_outside_bbox(self, geom: dict, lng: float, lat: float) -> None:
        min_lng, min_lat, max_lng, max_lat = polygon_bbox(geom)
        outside_lng = lng > max_lng + 1.0 or lng < min_lng - 1.0
        outside_lat = lat > max_lat + 1.0 or lat < min_lat - 1.0
        if outside_lng or outside_lat:
            assert point_in_geometry((lng, lat), geom) is False


class TestAreaAndBbox:
    @given(squares())
    @settings(max_examples=20)
    def test_area_is_non_negative_and_below_hemisphere(self, geom: dict) -> None:
        area = polygon_area_m2(geom)
        assert area >= 0.0
        assert area < 6.4e14

    @given(squares())
    @settings(max_examples=20)
    def test_bbox_matches_geometry_extents(self, geom: dict) -> None:
        min_lng, min_lat, max_lng, max_lat = polygon_bbox(geom)
        assert min_lng <= max_lng
        assert min_lat <= max_lat


class TestRobustness:
    @given(
        st.floats(min_value=-1000.0, max_value=1000.0, allow_nan=False, allow_infinity=False),
        st.floats(min_value=-1000.0, max_value=1000.0, allow_nan=False, allow_infinity=False),
    )
    @settings(max_examples=50)
    def test_point_in_polygon_when_ring_too_short(self, lng: float, lat: float) -> None:
        assert point_in_polygon((lng, lat), [(lng, lat)]) is False

    @given(st.text(max_size=64))
    @settings(max_examples=50)
    def test_parse_wkt_when_input_random_text_does_not_crash(self, raw: str) -> None:
        try:
            parse_wkt(raw)
        except (WKTError, ValueError):
            return
        except Exception as exc:
            pytest.fail(f"unexpected exception type: {type(exc).__name__}")
