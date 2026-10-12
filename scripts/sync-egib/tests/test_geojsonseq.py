"""Unit tests for the gzipped GeoJSONSeq staging writer."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

import pytest

from egib_sync.geojsonseq import GeojsonSeqError, build_feature, write_geojsonseq_gzip


def _parcel(index: int = 0) -> dict[str, Any]:
    from shapely.geometry import Polygon

    polygon = Polygon(
        [(21.0 + index, 52.0), (21.1 + index, 52.0), (21.1 + index, 52.1), (21.0 + index, 52.1)]
    )
    return {
        "id": f"141701_1.0022.{index}",
        "teryt": f"141701_1.0022.{index}",
        "number": str(index),
        "voivodeship": "mazowieckie",
        "voivodeship_code": "14",
        "county": "17",
        "county_code": "1417",
        "commune": "OTWOCK",
        "commune_code": "141701_2",
        "region": "0022",
        "region_name": "OTWOCK",
        "area_m2": 123.0,
        "land_use": "Ls",
        "geometry": polygon,
    }


def test_build_feature_when_canonical_then_geometry_and_properties_split():
    feature = build_feature(_parcel())

    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Polygon"
    assert feature["properties"]["teryt"] == "141701_1.0022.0"
    assert "geometry" not in feature["properties"]


def test_write_geojsonseq_gzip_when_parcels_then_gzip_lines_roundtrip(tmp_path: Path):
    output = tmp_path / "out.jsonl.gz"

    count = write_geojsonseq_gzip([_parcel(i) for i in range(3)], output)

    assert count == 3
    with gzip.open(output, "rt", encoding="utf-8") as fh:
        lines = [json.loads(line) for line in fh]
    assert len(lines) == 3
    assert lines[1]["id"] == "141701_1.0022.1"
    assert lines[0]["geometry"]["type"] == "Polygon"


def test_write_geojsonseq_gzip_when_default_output_name_then_atomic_no_tmp(tmp_path: Path):
    output = tmp_path / "kraj.jsonl.gz"

    write_geojsonseq_gzip([_parcel()], output)

    assert output.exists()
    assert [p.name for p in tmp_path.iterdir()] == [output.name]
    assert output.read_bytes()[:2] == b"\x1f\x8b"


def test_write_geojsonseq_gzip_when_iterator_fails_then_no_final_artifact(tmp_path: Path):
    class Explode:
        def __iter__(self):
            return self

        def __next__(self):
            raise RuntimeError("boom")

    output = tmp_path / "kraj.jsonl.gz"

    with pytest.raises(RuntimeError, match="boom"):
        write_geojsonseq_gzip(Explode(), output)

    assert not output.exists()
    assert list(tmp_path.iterdir()) == []


def test_write_geojsonseq_gzip_when_empty_input_then_geojsonseq_error(tmp_path: Path):
    output = tmp_path / "empty.jsonl.gz"

    with pytest.raises(GeojsonSeqError, match="no parcels"):
        write_geojsonseq_gzip([], output)

    assert not output.exists()


def test_write_geojsonseq_gzip_when_interrupt_then_previous_output_untouched(tmp_path: Path):
    output = tmp_path / "kraj.jsonl.gz"
    output.write_bytes(b"PREVIOUS-RUN")

    class Explode:
        def __iter__(self):
            return self

        def __next__(self):
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        write_geojsonseq_gzip(Explode(), output)

    assert output.read_bytes() == b"PREVIOUS-RUN"
