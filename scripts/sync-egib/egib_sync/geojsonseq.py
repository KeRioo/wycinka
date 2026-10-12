"""Streaming GeoJSONSeq writer (gzip) fed from canonical parcel iterators."""

from __future__ import annotations

import gzip
import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any, Final

from egib_sync.logging import get_logger

logger = get_logger(__name__)

GZIP_COMPRESSLEVEL: Final[int] = 6


class GeojsonSeqError(RuntimeError):
    """Raised when the GeoJSONSeq staging file cannot be finalized."""


def build_feature(parcel: Mapping[str, Any]) -> dict[str, Any]:
    """Convert a canonical parcel dict to a GeoJSON Feature dict."""
    geometry = parcel["geometry"]
    properties = {k: v for k, v in parcel.items() if k != "geometry"}
    feature: dict[str, Any] = {
        "type": "Feature",
        "id": str(parcel.get("id", "")),
        "geometry": _geom_to_mapping(geometry),
        "properties": properties,
    }
    return feature


def _geom_to_mapping(geometry: Any) -> dict[str, Any]:
    from shapely.geometry import mapping as shapely_mapping

    result = shapely_mapping(geometry)
    if isinstance(result, dict):
        return result
    raise TypeError(f"unexpected geometry mapping type: {type(result)!r}")


def write_geojsonseq_gzip(
    parcels: Iterable[Mapping[str, Any]],
    output: Path,
    *,
    gzip_compresslevel: int = GZIP_COMPRESSLEVEL,
) -> int:
    """Stream canonical parcels into a gzipped GeoJSONSeq file (atomic rename).

    Returns the number of features written. On failure the staging file is
    removed and the final ``output`` is never touched.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_name(f".{output.name}.tmp")
    count = 0
    try:
        with gzip.open(
            staging, "wt", encoding="utf-8", compresslevel=gzip_compresslevel, newline="\n"
        ) as fh:
            for parcel in parcels:
                fh.write(
                    json.dumps(build_feature(parcel), ensure_ascii=False, separators=(",", ":"))
                )
                fh.write("\n")
                count += 1
    except BaseException:
        staging.unlink(missing_ok=True)
        raise
    if count == 0:
        staging.unlink(missing_ok=True)
        raise GeojsonSeqError(f"no parcels to write, aborting GeoJSONSeq export: {output}")
    staging.replace(output)
    logger.info(
        "geojsonseq_written",
        output=str(output),
        features=count,
        bytes=output.stat().st_size,
    )
    return count


__all__ = [
    "GZIP_COMPRESSLEVEL",
    "GeojsonSeqError",
    "build_feature",
    "write_geojsonseq_gzip",
]
