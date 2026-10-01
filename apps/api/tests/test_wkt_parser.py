from __future__ import annotations

import pytest
from app.services.wkt_parser import WKTError, parse_wkt


class TestPointParsing:
    def test_parse_simple_polygon_when_no_holes(self) -> None:
        geom = parse_wkt("POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))")
        assert geom == {
            "type": "Polygon",
            "coordinates": [[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]],
        }

    def test_parse_polygon_with_hole_when_provided(self) -> None:
        geom = parse_wkt("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (2 2, 4 2, 4 4, 2 4, 2 2))")
        assert geom["type"] == "Polygon"
        assert len(geom["coordinates"]) == 2
        assert geom["coordinates"][0][0] == (0.0, 0.0)
        assert geom["coordinates"][1][-1] == geom["coordinates"][1][0]

    def test_parse_multipolygon_when_multiple_parts(self) -> None:
        wkt = "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)), ((2 2, 3 2, 3 3, 2 3, 2 2)))"
        geom = parse_wkt(wkt)
        assert geom["type"] == "MultiPolygon"
        assert len(geom["coordinates"]) == 2

    def test_parse_polygon_when_lowercase_keyword(self) -> None:
        geom = parse_wkt("polygon ((0 0, 1 0, 1 1, 0 1, 0 0))")
        assert geom["type"] == "Polygon"


class TestNegativeCases:
    def test_parse_polygon_when_unclosed_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt("POLYGON ((0 0, 1 0, 1 1, 0 1))")

    def test_parse_polygon_when_outer_is_clockwise_normalizes_to_ccw(self) -> None:
        geom = parse_wkt("POLYGON ((0 0, 0 1, 1 1, 1 0, 0 0))")
        outer = geom["coordinates"][0]
        assert outer[0] == outer[-1]
        assert outer[0] == (0.0, 0.0)
        assert outer[1] == (1.0, 0.0)

    def test_parse_polygon_when_hole_is_ccw_normalizes_to_cw(self) -> None:
        geom = parse_wkt("POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0), (2 2, 4 2, 4 4, 2 4, 2 2))")
        hole = geom["coordinates"][1]
        assert hole[0] == (2.0, 2.0)
        assert hole[1] == (2.0, 4.0)

    def test_parse_multipolygon_when_unbalanced_parens_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0))")

    def test_parse_polygon_when_empty_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt("POLYGON ()")

    def test_parse_garbage_when_unparseable_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt("not wkt at all")

    def test_parse_when_input_not_string_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt(123)  # type: ignore[arg-type]

    def test_parse_polygon_when_invalid_number_raises(self) -> None:
        with pytest.raises(WKTError):
            parse_wkt("POLYGON ((0 0, 1 0, abc 1, 0 1, 0 0))")
