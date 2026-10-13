"""Parallel national tile generation for the kraj GeoParquet pipeline.

Split the (sharded) GeoJSONSeq staging files into per-voivodeship buckets,
run tippecanoe on each region concurrently with a bounded job pool, merge
the resulting MBTiles with ``tile-join`` and convert to PMTiles v3 with
go-pmtiles. Regions are spatially disjoint (voivodeship boundaries), so
per-region simplification decisions never cross region borders.

Usage (inside the etl container)::

    python -m egib_sync.parallel_tiles \
        --staging /app/data/staging \
        --output /app/data/pmtiles/dzialki-kraj.pmtiles \
        --jobs 4
"""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from egib_sync.logging import get_logger
from egib_sync.powiat_gpkg import POW_VOIVODESHIP_CODES

logger = get_logger(__name__)

_WOIV_CODES: tuple[str, ...] = tuple(sorted(POW_VOIVODESHIP_CODES))
_POOLS = (
    "02",
    "04",
    "06",
    "08",
    "10",
    "12",
    "14",
    "16",
    "18",
    "20",
    "22",
    "24",
    "26",
    "28",
    "30",
    "32",
)


def _split_by_voivodeship(
    shard_paths: list[Path],
    staging_dir: Path,
) -> list[tuple[str, Path]]:
    """Stream shards once, writing one gzipped bucket per voivodeship."""
    staging_dir.mkdir(parents=True, exist_ok=True)
    handles: dict[str, Any] = {}
    writers: dict[str, Any] = {}
    outputs: dict[str, Path] = {}
    for code in _WOIV_CODES:
        out = staging_dir / f"kraj_dzialki.voiv{code}.geojsonl.gz"
        staging_tmp = out.with_name(f".{out.name}.tmp")
        handles[code] = gzip.open(staging_tmp, "wt", encoding="utf-8", newline="\n")  # noqa: SIM115
        writers[code] = staging_tmp
        outputs[code] = out
    counts: dict[str, int] = dict.fromkeys(_WOIV_CODES, 0)
    try:
        for shard in shard_paths:
            with gzip.open(shard, "rt", encoding="utf-8") as fh:
                for line in fh:
                    feature = json.loads(line)
                    code = str(feature["properties"].get("voivodeship_code", ""))
                    handle = handles.get(code)
                    if handle is None:
                        continue
                    handle.write(line)
                    counts[code] += 1
    finally:
        errors: list[str] = []
        for code, tmp in writers.items():
            try:
                handles[code].close()
                tmp.replace(outputs[code])
            except BaseException as exc:  # noqa: BLE001
                tmp.unlink(missing_ok=True)
                errors.append(f"{code}: {exc}")
        if errors:
            raise RuntimeError(f"bucket finalize failed: {errors}")
    for code, count in counts.items():
        logger.info("parallel_tiles_bucket_done", voiv=code, features=count)
    return [(code, outputs[code]) for code in _WOIV_CODES if counts[code] > 0]


def _run_tippecanoe_region(
    code: str,
    bucket: Path,
    staging_dir: Path,
    *,
    min_zoom: int,
    max_zoom: int,
    base_zoom: int | None,
    layer_name: str,
    tippecanoe_path: str,
) -> tuple[str, Path]:
    if not (0 <= min_zoom <= max_zoom <= 22):
        raise ValueError(f"invalid zoom range: min_zoom={min_zoom}, max_zoom={max_zoom}")
    if base_zoom is not None and not (min_zoom <= base_zoom <= max_zoom):
        raise ValueError(f"base_zoom ({base_zoom}) must be within [{min_zoom}, {max_zoom}]")
    if not layer_name or not layer_name.strip():
        raise ValueError("layer_name must be a non-empty string")
    tmp_dir = staging_dir / f"tippecanoe-voiv{code}-tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    result: Path = staging_dir / f"kraj-voiv{code}.mbtiles"
    cmd = [
        tippecanoe_path,
        "--force",
        f"--minimum-zoom={min_zoom}",
        f"--maximum-zoom={max_zoom}",
        "--drop-densest-as-needed",
        "--no-tile-size-limit",
        "--output=" + str(result),
        f"--temporary-directory={tmp_dir}",
        f"--layer={layer_name}",
        "--quiet",
        str(bucket),
    ]
    if base_zoom is not None:
        cmd.insert(3, f"--base-zoom={base_zoom}")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=None)  # noqa: S603, PLW1510
    except FileNotFoundError as exc:
        raise RuntimeError(f"tippecanoe nie znaleziony: {exc}") from exc
    finally:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
    if proc.returncode != 0:
        raise RuntimeError(f"tippecanoe[{code}] rc={proc.returncode}: {proc.stderr[-2000:]}")
    logger.info("parallel_tiles_region_done", voiv=code, mbtiles=result.stat().st_size)
    return code, result


def _merge_voivodeship_mbtiles(
    mbtiles_paths: list[Path],
    output: Path,
    tile_join_path: str,
    staging_dir: Path,
) -> Path:
    tmp_dir = staging_dir / "tile-join-tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    merged = output.with_name(f".{output.name}.merged.mbtiles")
    cmd = [tile_join_path, "--force", f"--output={merged}", *[p.as_posix() for p in mbtiles_paths]]
    logger.info("parallel_tiles_merging", inputs=len(mbtiles_paths), output=str(merged))
    proc = subprocess.run(cmd, capture_output=True, text=True)  # noqa: S603, PLW1510
    shutil.rmtree(tmp_dir, ignore_errors=True)
    if proc.returncode != 0:
        raise RuntimeError(f"tile-join rc={proc.returncode}: {proc.stderr[-2000:]}")
    return merged


def _resolve_tool(path: str) -> str | None:
    """Resolve a tool name via PATH; return None when it cannot be found."""
    if "/" in path or "\\" in path:
        return path if Path(path).exists() else None
    return shutil.which(path)


def run_parallel_tiles(
    shard_paths: list[Path],
    staging_dir: Path,
    output_pmtiles: Path,
    *,
    jobs: int = 4,
    tippecanoe_path: str = "tippecanoe",
    tile_join_path: str = "tile-join",
    pmtiles_convert_path: str = "pmtiles",
    os_shards: int = 4,
    min_zoom: int = 12,
    max_zoom: int = 16,
    base_zoom: int | None = None,
    layer_name: str = "dzialki",
) -> Path:
    """Split by region → concurrent tippecanoe → tile-join → PMTiles v3."""

    logger.info("parallel_tiles_start", shards=len(shard_paths))
    bucketed = _split_by_voivodeship(shard_paths, staging_dir)
    logger.info("parallel_tiles_split_done", regions=len(bucketed))

    mbtiles: list[tuple[str, Path]] = []
    with ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = {
            executor.submit(
                _run_tippecanoe_region,
                code,
                bucket,
                staging_dir,
                min_zoom=min_zoom,
                max_zoom=max_zoom,
                base_zoom=base_zoom,
                layer_name=layer_name,
                tippecanoe_path=tippecanoe_path,
            ): code
            for code, bucket in bucketed
        }
        for future in as_completed(futures):
            mbtiles.append(future.result())

    mbtiles_paths = [p for _, p in mbtiles]
    merged = _merge_voivodeship_mbtiles(mbtiles_paths, output_pmtiles, tile_join_path, staging_dir)

    final = output_pmtiles.with_name(f".{output_pmtiles.name}.tmp")
    resolved_convert = _resolve_tool(pmtiles_convert_path)
    if resolved_convert is not None:
        subprocess.run(  # noqa: S603
            [resolved_convert, "convert", str(merged), str(final)],
            check=True,
            capture_output=True,
        )
    else:
        shutil.copy(merged, final)
        logger.warning("pmtiles_convert_missing", fallback="copy")
    final.replace(output_pmtiles)
    merged.unlink(missing_ok=True)
    for _, region in mbtiles:
        region.unlink(missing_ok=True)
    for leftover in staging_dir.glob("kraj_dzialki.voiv*"):
        leftover.unlink(missing_ok=True)
    logger.info(
        "parallel_tiles_done", output=str(output_pmtiles), bytes=output_pmtiles.stat().st_size
    )
    return output_pmtiles


def main() -> int:
    parser = argparse.ArgumentParser(prog="egib-parallel-tiles", description=__doc__)
    parser.add_argument("--staging", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--tippecanoe", default="tippecanoe")
    parser.add_argument("--tile-join", default="tile-join")
    parser.add_argument("--pmtiles", default="pmtiles")
    parser.add_argument("--min-zoom", type=int, default=12)
    parser.add_argument("--max-zoom", type=int, default=16)
    parser.add_argument("--base-zoom", type=int, default=15)
    parser.add_argument("--layer", default="dzialki")
    args = parser.parse_args()
    shards = sorted(args.staging.glob("kraj_dzialki.geojsonl.gz.shard*"))
    if not shards:
        raise SystemExit(f"no shard files in {args.staging}")
    run_parallel_tiles(
        shards,
        args.staging,
        args.output,
        jobs=args.jobs,
        tippecanoe_path=args.tippecanoe,
        tile_join_path=args.tile_join,
        pmtiles_convert_path=args.pmtiles,
        min_zoom=args.min_zoom,
        max_zoom=args.max_zoom,
        base_zoom=args.base_zoom,
        layer_name=args.layer,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
