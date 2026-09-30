"""Tests for GPKG merger."""

from __future__ import annotations

from pathlib import Path

import pytest

from egib_sync.merger import (
    EmptyInputError,
    SchemaMismatchError,
    discover_layers,
    get_schema,
    merge_gpkg_files,
    read_layer,
    validate_file_schemas,
    validate_schemas,
    write_minimal_gpkg,
)


def _write_pair(tmp_path: Path, *, suffix: str = "") -> tuple[Path, Path]:
    a = write_minimal_gpkg(tmp_path / f"a{suffix}.gpkg", n_rows=3)
    b = write_minimal_gpkg(tmp_path / f"b{suffix}.gpkg", n_rows=2, base_lng=22.0)
    return a, b


def test_write_minimal_gpkg_when_called_then_file_exists(tmp_path: Path) -> None:
    p = write_minimal_gpkg(tmp_path / "x.gpkg")
    assert p.exists()
    assert p.stat().st_size > 0


def test_discover_layers_when_default_layer_then_returns_list(tmp_path: Path) -> None:
    write_minimal_gpkg(tmp_path / "x.gpkg")
    layers = discover_layers(tmp_path / "x.gpkg")
    assert isinstance(layers, list)
    assert len(layers) >= 1


def test_read_layer_when_called_then_returns_geodataframe(tmp_path: Path) -> None:
    p = write_minimal_gpkg(tmp_path / "x.gpkg")
    gdf = read_layer(p)
    assert len(gdf) == 3
    assert "id" in gdf.columns
    assert "geometry" in gdf.columns


def test_get_schema_when_called_then_returns_dict(tmp_path: Path) -> None:
    p = write_minimal_gpkg(tmp_path / "x.gpkg")
    schema = get_schema(read_layer(p))
    assert isinstance(schema, dict)
    assert "id" in schema


def test_validate_schemas_when_match_then_no_raise(tmp_path: Path) -> None:
    a, b = _write_pair(tmp_path)
    validate_schemas(read_layer(a), read_layer(b))


def test_validate_schemas_when_column_mismatch_then_raises(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg")
    b = write_minimal_gpkg(tmp_path / "b.gpkg", extra_columns={"foo": ["x"] * 3})
    with pytest.raises(SchemaMismatchError, match="column mismatch"):
        validate_schemas(read_layer(a), read_layer(b))


def test_validate_schemas_when_crs_mismatch_then_raises(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg", crs="EPSG:4326")
    b = write_minimal_gpkg(tmp_path / "b.gpkg", crs="EPSG:3857")
    with pytest.raises(SchemaMismatchError, match="CRS mismatch"):
        validate_schemas(read_layer(a), read_layer(b))


def test_validate_file_schemas_when_match_then_true(tmp_path: Path) -> None:
    a, b = _write_pair(tmp_path)
    assert validate_file_schemas([a, b]) is True


def test_validate_file_schemas_when_empty_then_raises() -> None:
    with pytest.raises(EmptyInputError):
        validate_file_schemas([])


def test_validate_file_schemas_when_mismatch_then_raises(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg")
    b = write_minimal_gpkg(tmp_path / "b.gpkg", extra_columns={"foo": ["x"] * 3})
    with pytest.raises(SchemaMismatchError):
        validate_file_schemas([a, b])


def test_merge_gpkg_files_when_two_files_then_combines_rows(tmp_path: Path) -> None:
    a, b = _write_pair(tmp_path)
    out = tmp_path / "merged.gpkg"
    result = merge_gpkg_files([a, b], out)
    assert result == out
    assert out.exists()
    merged_gdf = read_layer(out)
    assert len(merged_gdf) == 5


def test_merge_gpkg_files_when_empty_then_raises(tmp_path: Path) -> None:
    out = tmp_path / "merged.gpkg"
    with pytest.raises(EmptyInputError):
        merge_gpkg_files([], out)


def test_merge_gpkg_files_when_schema_mismatch_then_raises(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg")
    b = write_minimal_gpkg(tmp_path / "b.gpkg", extra_columns={"foo": ["x"] * 3})
    out = tmp_path / "merged.gpkg"
    with pytest.raises(SchemaMismatchError):
        merge_gpkg_files([a, b], out)


def test_merge_gpkg_files_when_atomic_write_then_tmp_removed(tmp_path: Path) -> None:
    a, b = _write_pair(tmp_path)
    out = tmp_path / "merged.gpkg"
    merge_gpkg_files([a, b], out)
    assert not (tmp_path / "merged.tmp.gpkg").exists()


def test_merge_gpkg_files_when_three_files_then_correct_total(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg", n_rows=4)
    b = write_minimal_gpkg(tmp_path / "b.gpkg", n_rows=3, base_lng=23.0)
    c = write_minimal_gpkg(tmp_path / "c.gpkg", n_rows=5, base_lng=24.0)
    out = tmp_path / "merged.gpkg"
    merge_gpkg_files([a, b, c], out)
    assert len(read_layer(out)) == 12


def test_merge_gpkg_files_preserves_crs(tmp_path: Path) -> None:
    a = write_minimal_gpkg(tmp_path / "a.gpkg", crs="EPSG:4326")
    b = write_minimal_gpkg(tmp_path / "b.gpkg", crs="EPSG:4326", base_lng=22.0)
    out = tmp_path / "merged.gpkg"
    merge_gpkg_files([a, b], out)
    assert read_layer(out).crs.to_string() == "EPSG:4326"