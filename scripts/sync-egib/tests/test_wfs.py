"""Tests for the GUGiK zbiorcza WFS downloader (mocked HTTP, real GML fixture)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import geopandas as gpd
import httpx
import pytest
import respx

from egib_sync.config import DownloadSettings
from egib_sync.wfs import (
    WFS_URL_DEFAULT,
    WfsSchemaError,
    build_getfeature_params,
    canonicalize_page,
    count_parcels_async,
    download_powiat_wfs,
    load_powiat_names,
    parse_area_m2,
    parse_number_matched,
    parse_obreb,
    read_gml_page,
    resolve_powiat_name,
)

FIXTURE_GML = Path(__file__).parent / "fixtures" / "wfs_dzialki_1417_sample.gml"
WFS_URL = "https://wfs.test/UslugaZbiorcza"
HITS_BYTES = b'<wfs:FeatureCollection numberMatched="3"></wfs:FeatureCollection>'


@pytest.fixture(autouse=True)
def no_retry_sleep(monkeypatch: Any):
    """Remove exponential backoff waits from mocked-failure tests."""

    async def _no_sleep(_delay: float) -> None:
        return None

    monkeypatch.setattr("egib_sync.retry.asyncio.sleep", _no_sleep)


@pytest.fixture
def fixture_gml_bytes() -> bytes:
    return FIXTURE_GML.read_bytes()


def test_build_getfeature_params_when_hits_then_number_parameters_present() -> None:
    params = build_getfeature_params(layer="ms:dzialki", teryt_prefix="1417", hits=True)
    assert params["resultType"] == "hits"
    assert params["typeNames"] == "ms:dzialki"
    assert "FILTER" in params and "1417%" in params["FILTER"]


def test_build_getfeature_params_when_pagination_then_startindex_included() -> None:
    params = build_getfeature_params(
        layer="ms:dzialki", teryt_prefix="1417", startindex=100, count=50
    )
    assert params["count"] == "50"
    assert params["STARTINDEX"] == "100"


def test_parse_number_matched_when_valid_hits_response_then_int() -> None:
    content = b'<wfs:FeatureCollection numberMatched="178103"></wfs:FeatureCollection>'
    assert parse_number_matched(content) == 178103


def test_parse_number_matched_when_missing_then_raises() -> None:
    with pytest.raises(Exception, match="numberMatched"):  # noqa: PT011
        parse_number_matched(b"<wfs:FeatureCollection/>")


def test_load_powiat_names_when_default_then_contains_otwocki() -> None:
    names = load_powiat_names()
    assert names["1417"] == "otwocki"
    assert len(names) > 300


def test_resolve_powiat_name_when_known_then_registry_name() -> None:
    assert resolve_powiat_name("1417") == "otwocki"


def test_resolve_powiat_name_when_unknown_then_fallback_code() -> None:
    assert resolve_powiat_name("9999", {}) == "powiat 9999"


def test_parse_area_m2_when_valid_string_then_float() -> None:
    assert parse_area_m2("1234.5") == 1234.5


def test_parse_area_m2_when_empty_or_invalid_then_zero() -> None:
    assert parse_area_m2(None) == 0.0
    assert parse_area_m2("") == 0.0
    assert parse_area_m2("abc") == 0.0


def test_parse_obreb_when_numeric_then_zero_padded() -> None:
    assert parse_obreb("16") == "0016"
    assert parse_obreb("0161") == "0161"


def test_parse_obreb_when_empty_then_empty() -> None:
    assert parse_obreb(None) == ""


def test_read_gml_page_when_real_fixture_then_parcel_attributes() -> None:
    gdf = read_gml_page(FIXTURE_GML)
    assert len(gdf) == 3
    assert set(gdf["ID_DZIALKI"]).issubset(
        {"141701_1.0001.86", "141701_1.0001.87", "141701_1.0001.88"}
    )
    assert str(gdf.crs).endswith("2180")


def test_canonicalize_page_when_real_fixture_then_canonical_schema_and_wgs84() -> None:
    raw = read_gml_page(FIXTURE_GML)
    canonical = canonicalize_page(
        raw,
        powiat_teryt="1417",
        powiat_name="otwocki",
        voivodeship_name="mazowieckie",
    )
    expected_nodes = {
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
        "geometry",
    }
    assert set(canonical.columns) == expected_nodes
    assert canonical.crs is not None and canonical.crs.to_epsg() == 4326
    row = canonical.iloc[0]
    assert row["teryt"] == "141701_1.0001.86"
    assert row["county_code"] == "1417"
    assert row["voivodeship_code"] == "14"
    assert row["region"] == "0001"
    assert row["area_m2"] > 0
    lng_min, lat_min, lng_max, lat_max = canonical.total_bounds
    assert 20.0 < lng_min < lng_max < 23.0
    assert 51.8 < lat_min < lat_max < 52.4


def test_canonicalize_page_when_missing_required_column_then_schema_error() -> None:
    gdf = gpd.GeoDataFrame(
        {"NAZWA_GMINY": ["JÓZEFÓW"]},
        geometry=gpd.GeoSeries.from_wkt(
            ["POLYGON ((21 52, 21.01 52, 21.01 52.01, 21 52.01, 21 52))"]
        ),
        crs="EPSG:4326",
    )
    with pytest.raises(WfsSchemaError):
        canonicalize_page(
            gdf,
            powiat_teryt="1417",
            powiat_name="otwocki",
            voivodeship_name="mazowieckie",
        )


def test_canonicalize_page_when_optional_columns_omitted_by_server_then_defaults() -> None:
    raw = read_gml_page(FIXTURE_GML)
    raw = raw[
        [
            c
            for c in raw.columns
            if c not in ("POLE_EWIDENYJNE", "KLASOUZYTKI_EGIB", "GRUPA_REJESTROWA")
        ]
    ]
    canonical = canonicalize_page(
        raw,
        powiat_teryt="1417",
        powiat_name="otwocki",
        voivodeship_name="mazowieckie",
    )
    assert len(canonical) == 3
    assert canonical["area_m2"].sum() > 0
    assert set(canonical["land_use"]) == {""}


@respx.mock
async def test_download_powiat_wfs_when_two_pages_then_atomic_gpkg_written(
    fixture_gml_bytes: bytes,
    tmp_path: Path,
) -> None:
    empty = fixture_gml_bytes.split(b"<wfs:member>")[0] + b"</wfs:FeatureCollection>\n"
    respx.get(WFS_URL).mock(
        side_effect=[
            httpx.Response(200, content=HITS_BYTES),
            httpx.Response(200, content=fixture_gml_bytes),  # page 1
            httpx.Response(200, content=empty),  # page 2 -> end
        ]
    )
    out = tmp_path / "raw"
    result = await download_powiat_wfs(
        "1417",
        out,
        settings=DownloadSettings(page_size=3),
        wfs_url=WFS_URL,
        page_size=3,
    )
    assert result.success
    assert result.parcels == 3
    assert result.pages == 1
    assert result.hits == 3
    asset = out / "1417.gpkg"
    assert asset.exists()
    assert not list(out.glob(".*.tmp.*"))
    gdf = gpd.read_file(str(asset))
    assert len(gdf) == 3
    assert str(gdf.crs).endswith("4326")


@respx.mock
async def test_download_powiat_wfs_when_duplicate_page_then_no_duplicates(
    fixture_gml_bytes: bytes,
    tmp_path: Path,
) -> None:
    empty = fixture_gml_bytes.split(b"<wfs:member>")[0] + b"</wfs:FeatureCollection>\n"
    respx.get(WFS_URL).mock(
        side_effect=[
            httpx.Response(200, content=HITS_BYTES),
            httpx.Response(200, content=fixture_gml_bytes),
            httpx.Response(200, content=fixture_gml_bytes),
            httpx.Response(200, content=empty),
        ]
    )
    result = await download_powiat_wfs("1417", tmp_path, wfs_url=WFS_URL, page_size=10)
    assert result.success
    assert result.parcels == 3


@respx.mock
async def test_download_powiat_wfs_when_budget_exceeded_then_aborts(
    fixture_gml_bytes: bytes,
    tmp_path: Path,
) -> None:
    respx.get(WFS_URL).mock(
        side_effect=[
            httpx.Response(200, content=HITS_BYTES),
            httpx.Response(200, content=fixture_gml_bytes),
            httpx.Response(200, content=fixture_gml_bytes),
            httpx.Response(200, content=fixture_gml_bytes),
        ]
    )
    result = await download_powiat_wfs(
        "1417",
        tmp_path,
        wfs_url=WFS_URL,
        page_size=10,
        max_result_bytes=len(fixture_gml_bytes) * 2 + 1,
    )
    assert not result.success
    assert result.error and "exceed" in result.error


@respx.mock
async def test_download_powiat_wfs_when_http_500_then_retries_then_fails(
    tmp_path: Path,
) -> None:
    respx.get(WFS_URL).mock(return_value=httpx.Response(500))
    result = await download_powiat_wfs("1417", tmp_path, wfs_url=WFS_URL, page_size=10)
    assert not result.success
    assert result.error
    assert not (tmp_path / "1417.gpkg").exists()
    assert not list(tmp_path.glob(".1417.tmp"))


@respx.mock
async def test_download_powiat_wfs_when_count_returns_500_then_download_continues(
    fixture_gml_bytes: bytes,
    tmp_path: Path,
) -> None:
    empty = fixture_gml_bytes.split(b"<wfs:member>")[0] + b"</wfs:FeatureCollection>\n"
    respx.get(WFS_URL).mock(
        side_effect=[
            httpx.Response(500),  # hits fails
            httpx.Response(500),  # hits retry 1
            httpx.Response(500),  # hits retry 2
            httpx.Response(500),  # hits retry 3
            httpx.Response(500),  # hits retry 4
            httpx.Response(500),  # hits retry 5 -> gives up
            httpx.Response(200, content=fixture_gml_bytes),  # page 1
            httpx.Response(200, content=empty),
        ]
    )
    result = await download_powiat_wfs("1417", tmp_path, wfs_url=WFS_URL, page_size=10)
    assert result.success
    assert result.hits == -1


@respx.mock
async def test_download_powiat_wfs_when_no_features_then_fails(tmp_path: Path) -> None:
    header_only = FIXTURE_GML.read_bytes().split(b"<wfs:member>")[0]
    header_only += b"</wfs:FeatureCollection>\n"
    respx.get(WFS_URL).mock(
        side_effect=[
            httpx.Response(200, content=HITS_BYTES),
            httpx.Response(200, content=header_only),
        ]
    )
    result = await download_powiat_wfs("1417", tmp_path, wfs_url=WFS_URL, page_size=10)
    assert not result.success
    assert result.error and "no features" in result.error


@respx.mock
async def test_count_parcels_async_when_ok_then_count() -> None:
    respx.get(WFS_URL).mock(return_value=httpx.Response(200, content=b'numberMatched="42"'))
    async with httpx.AsyncClient() as client:
        assert await count_parcels_async(client, WFS_URL, {"service": "WFS"}) == 42


@respx.mock
async def test_count_parcels_async_when_server_error_then_counts_still_returned() -> None:
    route = respx.get(WFS_URL).mock(return_value=httpx.Response(500))
    async with httpx.AsyncClient() as client:
        with pytest.raises(Exception):  # noqa: PT011
            await count_parcels_async(client, WFS_URL, {})
    assert route.call_count == 6


@respx.mock
async def test_wfs_default_url_is_gugik() -> None:
    assert WFS_URL_DEFAULT.startswith("https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB")
