"""Concatenate multiple GPKG files into one, validating schema consistency."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

import fiona
import geopandas as gpd
from shapely.geometry import Polygon

from egib_sync.logging import get_logger

logger = get_logger(__name__)


EXPECTED_COLUMNS: tuple[str, ...] = (
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
)


class SchemaMismatchError(ValueError):
    """Raised when GPKG schemas don't match between files."""


class EmptyInputError(ValueError):
    """Raised when no input files are provided."""


def discover_layers(gpkg_path: Path) -> list[str]:
    """List all layer names inside a GPKG file."""
    return list(fiona.listlayers(str(gpkg_path)))


def read_layer(gpkg_path: Path, layer: str | None = None) -> gpd.GeoDataFrame:
    """Read a single GPKG file (default: first layer) into a GeoDataFrame."""
    return gpd.read_file(str(gpkg_path), layer=layer) if layer else gpd.read_file(str(gpkg_path))


def get_schema(gdf: gpd.GeoDataFrame) -> dict[str, str]:
    """Return the schema (column name -> dtype) of a GeoDataFrame."""
    return {col: str(dtype) for col, dtype in gdf.dtypes.items()}


def validate_schemas(gdf_a: gpd.GeoDataFrame, gdf_b: gpd.GeoDataFrame) -> None:
    """Ensure two GeoDataFrames share the same columns and CRS.

    Raises ``SchemaMismatchError`` with a descriptive message if not.
    """
    cols_a = set(get_schema(gdf_a).keys())
    cols_b = set(get_schema(gdf_b).keys())
    if cols_a != cols_b:
        only_a = sorted(cols_a - cols_b)
        only_b = sorted(cols_b - cols_a)
        raise SchemaMismatchError(
            f"column mismatch: only_in_first={only_a}, only_in_second={only_b}"
        )
    if gdf_a.crs != gdf_b.crs:
        raise SchemaMismatchError(
            f"CRS mismatch: first={gdf_a.crs}, second={gdf_b.crs}"
        )


def validate_file_schemas(gpkg_files: Iterable[Path]) -> bool:
    """Read every GPKG and check that all share the same schema.

    Returns True if consistent; raises ``SchemaMismatchError`` if not.
    """
    files = list(gpkg_files)
    if not files:
        raise EmptyInputError("no GPKG files provided")

    base = read_layer(files[0])
    base_schema = get_schema(base)
    base_crs = base.crs
    for path in files[1:]:
        gdf = read_layer(path)
        if get_schema(gdf) != base_schema:
            raise SchemaMismatchError(
                f"schema mismatch between {files[0].name} and {path.name}"
            )
        if gdf.crs != base_crs:
            raise SchemaMismatchError(
                f"CRS mismatch between {files[0].name} ({base_crs}) "
                f"and {path.name} ({gdf.crs})"
            )
    return True


def merge_gpkg_files(input_files: list[Path], output: Path) -> Path:
    """Concatenate multiple GPKG files into a single GPKG.

    Validates that all input files share the same schema before writing.
    Atomic: writes to ``output.tmp`` and renames on success.
    """
    if not input_files:
        raise EmptyInputError("cannot merge: no input files")

    frames: list[gpd.GeoDataFrame] = []
    base = read_layer(input_files[0])
    frames.append(base)
    for path in input_files[1:]:
        gdf = read_layer(path)
        validate_schemas(base, gdf)
        frames.append(gdf)

    merged = gpd.GeoDataFrame(pd_concat(frames, ignore_index=True), crs=base.crs)

    output.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output.with_name(output.stem + ".tmp.gpkg")
    merged.to_file(str(tmp_path), driver="GPKG")
    tmp_path.replace(output)
    logger.info(
        "merge_done",
        output=str(output),
        inputs=len(input_files),
        rows=len(merged),
    )
    return output


def pd_concat(frames: Iterable[gpd.GeoDataFrame], *, ignore_index: bool = True) -> Any:
    """Concatenate GeoDataFrames via pandas, preserving geometry column."""
    import pandas as pd

    return pd.concat(list(frames), ignore_index=ignore_index)


def write_minimal_gpkg(
    path: Path,
    *,
    n_rows: int = 3,
    extra_columns: dict[str, Any] | None = None,
    crs: str = "EPSG:4326",
    base_lng: float = 21.0,
    base_lat: float = 52.0,
) -> Path:
    """Create a minimal valid GPKG file with a small grid of parcels (for tests).

    Columns match the canonical EGiB schema. ``extra_columns`` lets tests inject
    extra columns to trigger schema-mismatch assertions.
    """
    columns = {
        "id": [f"141201_1.000{i + 1}.{6500 + i}" for i in range(n_rows)],
        "teryt": [f"141201_1.000{i + 1}.{6500 + i}" for i in range(n_rows)],
        "number": [str(6500 + i) for i in range(n_rows)],
        "voivodeship": ["mazowieckie"] * n_rows,
        "voivodeship_code": ["14"] * n_rows,
        "county": ["Warszawa"] * n_rows,
        "county_code": ["1201"] * n_rows,
        "commune": ["Warszawa"] * n_rows,
        "commune_code": ["141201"] * n_rows,
        "region": [f"000{i + 1}" for i in range(n_rows)],
        "region_name": [f"Obreb {i + 1}" for i in range(n_rows)],
        "area_m2": [1500.0 + i * 100 for i in range(n_rows)],
        "land_use": ["Ls"] * n_rows,
    }
    if extra_columns:
        columns.update(extra_columns)

    polygons = [
        Polygon(
            [
                (base_lng + i * 0.01, base_lat + i * 0.01),
                (base_lng + i * 0.01 + 0.005, base_lat + i * 0.01),
                (base_lng + i * 0.01 + 0.005, base_lat + i * 0.01 + 0.005),
                (base_lng + i * 0.01, base_lat + i * 0.01 + 0.005),
            ]
        )
        for i in range(n_rows)
    ]

    gdf = gpd.GeoDataFrame(columns, geometry=polygons, crs=crs)
    path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(str(path), driver="GPKG")
    return path


__all__ = [
    "EmptyInputError",
    "EXPECTED_COLUMNS",
    "SchemaMismatchError",
    "discover_layers",
    "get_schema",
    "merge_gpkg_files",
    "read_layer",
    "validate_file_schemas",
    "validate_schemas",
    "write_minimal_gpkg",
]