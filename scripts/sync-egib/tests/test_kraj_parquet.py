"""Unit tests for the kraj GeoParquet streaming reader + canonicalizer."""

from __future__ import annotations

import httpx
import numpy as np
import pyarrow as pa
import pytest
import respx
from pyproj import Transformer
from shapely import from_wkb

from egib_sync.kraj_parquet import (
    KrajParquetError,
    KrajParquetReader,
    canonicalize_row,
    canonicalize_table,
    make_transformer,
    reproject_to_wgs84,
    validate_schema,
)
from tests.helpers.kraj_parquet_builder import (
    build_table,
    make_row,
    polygon_at,
    write_kraj_parquet,
    write_multigroup_parquet,
)


def _wgs84_of(row: dict) -> object:
    geoms = reproject_to_wgs84([from_wkb(row["geometry"])])
    return geoms[0]


def test_canonicalize_row_when_teryt_matches_then_maps_all_fields():
    row = make_row("141701_1.0022.2/2", pole_ewidencyjne=1234.5, klasouzytki_egib="Ls")
    wgs = _wgs84_of(row)

    parcel = canonicalize_row(row, wgs)

    assert parcel is not None
    assert parcel["id"] == "141701_1.0022.2/2"
    assert parcel["voivodeship"] == "mazowieckie"
    assert parcel["voivodeship_code"] == "14"
    assert parcel["county"] == "17"
    assert parcel["county_code"] == "1417"
    assert parcel["commune_code"] == "14_JED"
    assert parcel["number"] == "2/2"


def test_canonicalize_row_when_teryt_invalid_then_none():
    row = make_row("XXYYZZ_not-valid", klasouzytki_egib="Ls")
    wgs = _wgs84_of(row)

    assert canonicalize_row(row, wgs) is None


def test_canonicalize_row_when_pole_missing_then_zero_area():
    row = make_row("226101_2.0003.45/6", pole_ewidencyjne=None)
    wgs = _wgs84_of(row)

    parcel = canonicalize_row(row, wgs)

    assert parcel is not None
    assert parcel["area_m2"] == 0.0


def test_canonicalize_row_when_klaso_missing_then_inne():
    row = make_row("226101_2.0003.45/6", klasouzytki_egib=None)
    wgs = _wgs84_of(row)

    parcel = canonicalize_row(row, wgs)

    assert parcel is not None
    assert parcel["land_use"] == "Inne"


def test_canonicalize_row_when_defaults_then_falls_back_to_parsed_teryt():
    row = make_row("226101_2.0003.45/6")
    row = {k: v for k, v in row.items() if k not in ("numer_dzialki", "numer_obrebu")}
    wgs = _wgs84_of(row)

    parcel = canonicalize_row(row, wgs)

    assert parcel is not None
    assert parcel["number"] == "45/6"
    assert parcel["region"] == "0003"


def test_reproject_to_wgs84_when_sample_polygon_then_matches_pyproj_reference():
    geometry = polygon_at(524_000.0, 481_000.0, size=50.0)
    reference = Transformer.from_crs(2180, 4326, always_xy=True)
    lng_ref, lat_ref = reference.transform(524_025.0, 481_025.0)

    reprojected = reproject_to_wgs84([geometry])

    centroid = reprojected[0].centroid  # type: ignore[union-attr]
    assert centroid.x == pytest.approx(lng_ref, abs=1e-7)
    assert centroid.y == pytest.approx(lat_ref, abs=1e-7)


def test_reproject_to_wgs84_when_none_entries_then_passthrough():
    from shapely.geometry import Polygon

    geometry = polygon_at(500_000.0, 480_000.0)
    reprojected = reproject_to_wgs84([None, geometry])
    assert reprojected[0] is None
    assert isinstance(reprojected[1], Polygon)


def test_canonicalize_table_when_sample_rows_then_stats_count():
    rows = [make_row(f"1417{v:02d}_2.0001.{i}", easting=524_000.0 + i) for i, v in enumerate(range(5))]

    records, stats = canonicalize_table(build_table(rows), make_transformer())

    assert stats.rows == 5
    assert stats.kept == 5
    assert stats.row_groups == 0
    assert records[0]["region"] == "0001"


def test_canonicalize_table_when_null_geometry_then_skipped():
    rows = [make_row("141701_1.0022.1"), make_row("141701_1.0022.2")]
    table = build_table(rows)
    column = table.column("geometry")
    values = column.to_pylist()
    values[1] = None
    table = table.set_column(
        table.column_names.index("geometry"),
        "geometry",
        pa.array(values, type=pa.binary()),
    )

    records, stats = canonicalize_table(table, make_transformer())

    assert stats.skipped_geometry == 1
    assert len(records) == 1


def test_canonicalize_table_when_bad_teryt_then_skipped():
    rows = [make_row("BAD-ID"), make_row("141701_1.0022.3")]

    records, stats = canonicalize_table(build_table(rows), make_transformer())

    assert stats.skipped_teryt == 1
    assert [r["id"] for r in records] == ["141701_1.0022.3"]


def test_validate_schema_when_missing_columns_then_error():
    table = pa.table({"id_dzialki": ["x"]})

    with pytest.raises(KrajParquetError, match="missing columns"):
        validate_schema(table)


def test_reader_when_missing_file_then_raises(tmp_path):
    with pytest.raises(KrajParquetError, match="not found"):
        KrajParquetReader(tmp_path / "missing.parquet")


def test_reader_when_full_then_streams_all(tmp_path):
    groups = [
        [
            make_row(
                f"141701_1.0022.{i}/{g}",
                easting=524_000.0 + i * 111,
                northing=481_000.0 + g * 10,
            )
            for i in range(4)
        ]
        for g in range(2)
    ]
    path = write_multigroup_parquet(tmp_path / "kraj.parquet", groups)
    reader = KrajParquetReader(path)

    parcels = list(reader.iter_parcels(batch_rows=3))

    assert len(parcels) == 8
    assert reader.stats.rows == 8
    assert [p["number"] for p in parcels] == [
        "0/0",
        "1/0",
        "2/0",
        "3/0",
        "0/1",
        "1/1",
        "2/1",
        "3/1",
    ]
    reader.close()


def test_reader_when_max_rows_then_limits_output(tmp_path):
    groups = [
        [
            make_row(
                f"141701_1.0022.{i}_{g}",
                easting=524_000.0 + i * 120,
                northing=481_000.0 + g * 4,
            )
            for i in range(5)
        ]
        for g in range(2)
    ]
    path = write_multigroup_parquet(tmp_path / "kraj.parquet", groups)
    reader = KrajParquetReader(path)

    limited = list(reader.iter_parcels(max_rows=3))
    first_group = list(reader.iter_parcels(max_row_groups=1))

    assert len(limited) == 3
    assert len(first_group) == 5
    reader.close()


def test_reader_when_invalid_batch_size_then_value_error(tmp_path):
    path = write_kraj_parquet(tmp_path / "kraj.parquet", [make_row()])
    reader = KrajParquetReader(path)

    with pytest.raises(ValueError, match="batch_rows"):
        list(reader.iter_parcels(batch_rows=0))
    reader.close()


@pytest.fixture
def kraj_url() -> str:
    from egib_sync.kraj_parquet import KRAJ_PARQUET_URL

    return KRAJ_PARQUET_URL


@pytest.fixture
def voiv_url() -> str:
    from egib_sync.kraj_parquet import KRAJ_PARQUET_VOIV_TEMPLATE

    return KRAJ_PARQUET_VOIV_TEMPLATE.format(voiv="14")


@respx.mock
def test_download_kraj_parquet_when_success_then_target_full(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import download_kraj_parquet

    payload = b"PARQUET-FULL-CONTENT" * 10
    respx.get(kraj_url).respond(200, content=payload)
    target = tmp_path / "kraj" / "0_dzialki.parquet"

    out = download_kraj_parquet(kraj_url, target, chunk_size=256)

    assert out == target
    assert target.read_bytes() == payload
    assert not target.with_suffix(".parquet.part").exists()


@respx.mock
def test_download_kraj_parquet_when_resume_then_range_sent_and_appended(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import download_kraj_parquet

    target = tmp_path / "0_dzialki.parquet"
    part = target.with_suffix(".parquet.part")
    part.parent.mkdir(parents=True, exist_ok=True)
    part.write_bytes(b"A" * 4096)
    route = respx.get(kraj_url).respond(206, content=b"B" * 4096)

    download_kraj_parquet(kraj_url, target, chunk_size=1024)

    request = route.calls.last.request
    assert request.headers.get("Range") == "bytes=4096-"
    assert target.read_bytes() == b"A" * 4096 + b"B" * 4096
    assert not part.exists()


@respx.mock
def test_download_kraj_parquet_when_server_returns_200_after_resume_then_rewrites(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import download_kraj_parquet

    target = tmp_path / "0_dzialki.parquet"
    part = target.with_suffix(".parquet.part")
    part.parent.mkdir(parents=True, exist_ok=True)
    part.write_bytes(b"STALE" * 100)
    respx.get(kraj_url).respond(200, content=b"FRESH")

    download_kraj_parquet(kraj_url, target, chunk_size=64)

    assert target.read_bytes() == b"FRESH"
    assert not part.exists()


@respx.mock
def test_download_kraj_parquet_when_500_then_retry_then_success(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import download_kraj_parquet

    respx.get(kraj_url).mock(
        side_effect=[httpx.Response(500, content=b""), httpx.Response(200, content=b"ok")]
    )
    target = tmp_path / "0_dzialki.parquet"

    out = download_kraj_parquet(kraj_url, target, max_retries=2)

    assert out.read_bytes() == b"ok"


@respx.mock
def test_download_kraj_parquet_when_all_fail_then_kraj_parquet_error(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import download_kraj_parquet

    respx.get(kraj_url).mock(side_effect=httpx.ConnectError("timeout"))

    with pytest.raises(KrajParquetError, match="after"):
        download_kraj_parquet(kraj_url, tmp_path / "0.parquet", max_retries=2)


@respx.mock
def test_ensure_kraj_parquet_when_exists_then_no_download(tmp_path, kraj_url):
    from egib_sync.kraj_parquet import ensure_kraj_parquet

    existing = tmp_path / "0.parquet"
    existing.write_bytes(b"cached")
    respx.get(kraj_url).respond(500, content=b"")

    result = ensure_kraj_parquet(existing, kraj_url)

    assert result == existing and existing.read_bytes() == b"cached"


def test_voiv_template_when_formatted_then_contains_voiv(voiv_url):
    assert "14" in voiv_url and "dzialki" in voiv_url


def test_reader_numpy_geoarray_when_from_wkb_then_supports_object_dtype():
    rows = [make_row("141701_1.0022.9")]
    table = build_table(rows)
    geoms = from_wkb(np.asarray(table.column("geometry").to_pylist(), dtype=object))
    assert geoms[0].geom_type == "Polygon"
