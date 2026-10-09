"""Tests for powiat export GPKG canonicalization (egib_sync.powiat_gpkg)."""

from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Polygon

from egib_sync.powiat_gpkg import (
    PowiatGpkgError,
    canonicalize_powiat_gdf,
    canonicalize_powiat_gpkg,
    parse_teryt_units,
)

TEST_IMPORTS_DIR = Path(__file__).parent


@pytest.fixture()
def sample_gdf() -> gpd.GeoDataFrame:
    """A minimal export-style GeoDataFrame with the ezioUDP source columns."""
    polygon = Polygon([(688000, 580000), (688500, 580000), (688500, 580500), (688000, 580500)])
    return gpd.GeoDataFrame(
        {
            "fid": [1, 2],
            "id_dzialki": ["141701_1.0022.2/2", "141705_2.0001.5"],
            "numer_dzialki": ["2/2", "5"],
            "nazwa_obrebu": ["22", "1"],
            "numer_obrebu": ["0022", "0001"],
            "numer_jednostki": ["141701_1", "141705_2"],
            "nazwa_gminy": ["JÓZEFÓW", "KOŁBIEL"],
            "data": ["2026-10-07", "2026-10-07"],
            "pole_ewidencyjne": [None, 1200.5],
            "klasouzytki_egib": [None, "BzIIIa"],
            "grupa_rejestrowa": [None, None],
            "pozostale_atrybuty": ["{}", "format"],
            "czas_pozyskania": ["2026-10-07 23:37", "2026-10-07 23:37"],
            "geometry": [polygon, polygon],
        },
        geometry="geometry",
        crs="EPSG:2180",
    )


def test_parse_teryt_units_when_full_teryt_then_split_fields():
    voiv, county, commune, region, number = parse_teryt_units("141701_1.0022.2/2")
    assert (voiv, county, commune, region, number) == ("14", "17", "01", "0022", "2/2")


def test_parse_teryt_units_when_invalid_then_empty_strings():
    assert parse_teryt_units("JAN") == ("", "", "", "", "")


def test_canonicalize_when_valid_then_canonical_columns(sample_gdf):
    out = canonicalize_powiat_gdf(sample_gdf)
    for column in ("id", "teryt", "number", "voivodeship", "voivodeship_code",
                   "county", "county_code", "commune", "commune_code",
                   "region", "region_name", "area_m2", "land_use", "geometry"):
        assert column in out.columns, column
    first = out.iloc[0]
    assert first["teryt"] == "141701_1.0022.2/2"
    assert first["number"] == "2/2"
    assert first["voivodeship"] == "mazowieckie"
    assert first["voivodeship_code"] == "14"
    assert first["county_code"].startswith("14")
    assert first["region"] == "0022"
    assert first["commune"] == "JÓZEFÓW"


def test_canonicalize_when_missing_landuse_then_inne_fallback(sample_gdf):
    out = canonicalize_powiat_gdf(sample_gdf)
    assert out.iloc[0]["land_use"] == "Inne"


def test_canonicalize_when_area_present_then_numeric(sample_gdf):
    out = canonicalize_powiat_gdf(sample_gdf)
    assert float(out.iloc[1]["area_m2"]) == pytest.approx(1200.5)


def test_canonicalize_when_missing_columns_then_raise():
    empty = gpd.GeoDataFrame({"id": [1]}, geometry=gpd.GeoSeries.from_xy([21.0], [52.0]))
    with pytest.raises(PowiatGpkgError, match="missing required columns"):
        canonicalize_powiat_gdf(empty)


def test_canonicalize_when_teryt_invalid_then_skipped(sample_gdf):
    sample_gdf.loc[sample_gdf.index[0], "id_dzialki"] = "nie-poprawny"
    out = canonicalize_powiat_gdf(sample_gdf)
    assert len(out) == 1


def test_canonicalize_when_all_invalid_then_raise(sample_gdf):
    sample_gdf["id_dzialki"] = "x"
    with pytest.raises(PowiatGpkgError, match="no features"):
        canonicalize_powiat_gdf(sample_gdf)


def test_canonicalize_gpkg_when_realizacion_then_roundtrip(sample_gdf, tmp_path):
    src = tmp_path / "src.gpkg"
    sample_gdf.to_file(src, layer="dzialki", driver="GPKG")
    dst = tmp_path / "out.gpkg"
    canonicalize_powiat_gpkg(src, dst)
    assert dst.exists()
    reloaded = gpd.read_file(dst)
    assert len(reloaded) == 2
    assert list(reloaded.columns) == list(canonicalize_powiat_gdf(sample_gdf).columns)
