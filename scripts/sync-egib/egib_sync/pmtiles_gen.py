"""PMTiles generator — thin wrapper around the ``tippecanoe`` CLI.

Builds the right command-line flags, runs ``tippecanoe`` via ``subprocess``,
and writes the output file atomically (write to ``.tmp`` then ``rename``).
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Final

from egib_sync.logging import get_logger

logger = get_logger(__name__)


class TippecanoeNotFoundError(FileNotFoundError):
    """Raised when the ``tippecanoe`` binary cannot be located."""


class TippecanoeError(RuntimeError):
    """Raised when ``tippecanoe`` exits with a non-zero status."""

    def __init__(self, returncode: int, stderr: str, command: list[str]) -> None:
        cmd_str = " ".join(command)
        super().__init__(f"tippecanoe failed (exit {returncode}): {stderr.strip() or cmd_str}")
        self.returncode = returncode
        self.stderr = stderr
        self.command = command


def _gpkg_to_geojsonl(input_gpkg: Path, output: Path) -> Path:
    """Convert a GeoPackage to line-delimited GeoJSON (WGS 84 required by tippecanoe)."""
    import geopandas as gpd
    import pyogrio

    gdf = gpd.read_file(str(input_gpkg))
    crs = gdf.crs.to_epsg() if gdf.crs is not None else None
    if crs is not None and crs != 4326:
        gdf = gdf.to_crs("EPSG:4326")
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    pyogrio.write_dataframe(gdf, str(output), driver="GeoJSONSeq")
    logger.info(
        "gpkg_converted_to_geojsonl",
        input=str(input_gpkg),
        output=str(output),
        features=len(gdf),
        bytes=output.stat().st_size,
    )
    return output


_TIPPECANOE_MIN_TILE_SIZE: Final = 0
_FORCE_FLAG: Final = "--force"
_LAYER_FLAG_PREFIX: Final = "--layer="


def _resolve_tippecanoe(tippecanoe_path: str) -> str:
    """Locate the ``tippecanoe`` executable (PATH lookup or explicit path).

    Raises ``TippecanoeNotFoundError`` if it cannot be located.
    """
    if "/" in tippecanoe_path or "\\" in tippecanoe_path:
        candidate = Path(tippecanoe_path)
        if not candidate.is_file():
            raise TippecanoeNotFoundError(f"tippecanoe binary not found at {tippecanoe_path}")
        return str(candidate)
    resolved = shutil.which(tippecanoe_path)
    if resolved is None:
        raise TippecanoeNotFoundError(
            f"tippecanoe binary not found in PATH (looked for '{tippecanoe_path}')"
        )
    return resolved


def _build_command(
    *,
    input_gpkg: Path,
    output_pmtiles: Path,
    tippecanoe: str,
    min_zoom: int,
    max_zoom: int,
    base_zoom: int,
    layer_name: str,
    drop_densest: bool,
    extend_zooms: bool,
) -> list[str]:
    """Build the tippecanoe CLI argument list (does not execute)."""
    if not (0 <= min_zoom <= max_zoom <= 22):
        raise ValueError(f"invalid zoom range: min_zoom={min_zoom}, max_zoom={max_zoom}")
    if not (min_zoom <= base_zoom <= max_zoom):
        raise ValueError(f"base_zoom ({base_zoom}) must be within [{min_zoom}, {max_zoom}]")
    if not layer_name or not layer_name.strip():
        raise ValueError("layer_name must be a non-empty string")

    cmd: list[str] = [
        tippecanoe,
        f"--output={output_pmtiles}",
        f"--minimum-zoom={min_zoom}",
        f"--maximum-zoom={max_zoom}",
        f"--base-zoom={base_zoom}",
        f"{_LAYER_FLAG_PREFIX}{layer_name}",
        _FORCE_FLAG,
        "--read-parallel",
    ]
    if drop_densest:
        cmd.append("--drop-densest-as-needed")
    if extend_zooms:
        cmd.append("--extend-zooms-if-still-dropping")
    cmd.append(str(input_gpkg))
    return cmd


def _atomic_replace(tmp: Path, final: Path) -> None:
    """Atomically replace ``final`` with ``tmp``.

    Uses ``Path.replace`` which is atomic within the same filesystem.
    """
    if final.exists():
        final.unlink()
    tmp.replace(final)


def generate_pmtiles(
    input_gpkg: Path,
    output_pmtiles: Path,
    *,
    min_zoom: int = 4,
    max_zoom: int = 18,
    base_zoom: int = 14,
    layer_name: str = "dzialki",
    tippecanoe_path: str = "tippecanoe",
    drop_densest: bool = True,
    extend_zooms: bool = True,
    min_tile_size: int = _TIPPECANOE_MIN_TILE_SIZE,
) -> Path:
    """Generate a PMTiles archive from a GPKG input via ``tippecanoe``.

    The output is written atomically: ``tippecanoe`` is invoked with a
    ``.tmp`` filename, and on success the file is renamed to ``output_pmtiles``.
    If the process fails or raises, no ``output_pmtiles`` is touched.

    Args:
        input_gpkg: Source GPKG file. Must exist.
        output_pmtiles: Destination path for the PMTiles archive.
        min_zoom: Lowest zoom level for tile pyramid.
        max_zoom: Highest zoom level for tile pyramid.
        base_zoom: Detail level at which the input is sampled at native resolution.
        layer_name: Vector tile layer name.
        tippecanoe_path: Path to ``tippecanoe`` binary (or name on PATH).
        drop_densest: Pass ``--drop-densest-as-needed`` to tippecanoe.
        extend_zooms: Pass ``--extend-zooms-if-still-dropping`` to tippecanoe.
        min_tile_size: Tile size hint passed as ``--minimum-tile-size``.

    Returns:
        The ``output_pmtiles`` path on success.

    Raises:
        FileNotFoundError: When ``input_gpkg`` does not exist.
        TippecanoeNotFoundError: When ``tippecanoe`` cannot be located.
        TippecanoeError: When ``tippecanoe`` exits with a non-zero status.
    """
    if not input_gpkg.exists():
        raise FileNotFoundError(f"input GPKG not found: {input_gpkg}")

    tippecanoe = _resolve_tippecanoe(tippecanoe_path)

    output_pmtiles = output_pmtiles.expanduser().resolve()
    output_pmtiles.parent.mkdir(parents=True, exist_ok=True)

    input_path = input_gpkg
    if input_gpkg.suffix.lower() == ".gpkg":
        input_path = _gpkg_to_geojsonl(input_gpkg, input_gpkg.with_suffix(".gpkg.geojsonl"))

    tmp_path = output_pmtiles.with_name(f".{output_pmtiles.name}.tmp")

    cmd = _build_command(
        input_gpkg=input_path,
        output_pmtiles=tmp_path,
        tippecanoe=tippecanoe,
        min_zoom=min_zoom,
        max_zoom=max_zoom,
        base_zoom=base_zoom,
        layer_name=layer_name,
        drop_densest=drop_densest,
        extend_zooms=extend_zooms,
    )
    if min_tile_size > 0:
        cmd.insert(-1, f"--minimum-tile-size={min_tile_size}")

    logger.info(
        "pmtiles_generating",
        input=str(input_gpkg),
        output=str(output_pmtiles),
        min_zoom=min_zoom,
        max_zoom=max_zoom,
        base_zoom=base_zoom,
        layer=layer_name,
    )

    try:
        result = subprocess.run(  # noqa: S603
            cmd,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        raise TippecanoeNotFoundError(
            f"failed to execute tippecanoe at {tippecanoe}: {exc}"
        ) from exc

    if result.returncode != 0:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise TippecanoeError(result.returncode, result.stderr, cmd)

    if not tmp_path.exists() or tmp_path.stat().st_size == 0:
        raise TippecanoeError(
            result.returncode,
            "tippecanoe exited 0 but produced no output",
            cmd,
        )

    _atomic_replace(tmp_path, output_pmtiles)

    size = output_pmtiles.stat().st_size
    logger.info(
        "pmtiles_generated",
        input=str(input_gpkg),
        output=str(output_pmtiles),
        size_bytes=size,
    )
    return output_pmtiles


__all__ = [
    "TippecanoeError",
    "TippecanoeNotFoundError",
    "generate_pmtiles",
]
