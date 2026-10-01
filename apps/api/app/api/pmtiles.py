from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING, Final

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response

from ..models.parcel import ErrorResponse

if TYPE_CHECKING:
    from pathlib import Path

router = APIRouter()

_RANGE_RE: Final[re.Pattern[str]] = re.compile(
    r"^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$", re.IGNORECASE
)


def _pmtiles_unavailable(message: str = "PMTiles file is not available") -> HTTPException:
    return HTTPException(
        status_code=503,
        detail=ErrorResponse(error=message, code="PMTILES_UNAVAILABLE", details={}).model_dump(),
    )


def _range_unparseable(raw_value: str) -> HTTPException:
    return HTTPException(
        status_code=416,
        detail=ErrorResponse(
            error="Range header is unparseable",
            code="BAD_REQUEST",
            details={"range": raw_value},
        ).model_dump(),
    )


def _parse_range_header(header_value: str, total_size: int) -> tuple[int, int] | None:
    """Parse ``Range: bytes=START-END`` and return ``(start, end_inclusive)``.

    Returns ``None`` when the range is unsatisfiable.
    """
    if not header_value:
        return None
    match = _RANGE_RE.match(header_value)
    if not match:
        return None

    start_raw, end_raw = match.group(1), match.group(2)

    if not start_raw and not end_raw:
        return None

    if not start_raw:
        suffix = int(end_raw)
        if suffix <= 0:
            return None
        start = max(0, total_size - suffix)
        end = total_size - 1
    elif not end_raw:
        start = int(start_raw)
        end = total_size - 1
    else:
        start = int(start_raw)
        end = int(end_raw)

    if start < 0 or end < start:
        return None
    if start >= total_size:
        return None
    end = min(end, total_size - 1)
    return start, end


def _etag_for(path: Path) -> str:
    stat = path.stat()
    digest = hashlib.sha256()
    digest.update(str(stat.st_mtime_ns).encode())
    digest.update(str(stat.st_size).encode())
    return f'"{digest.hexdigest()[:16]}"'


@router.get(
    "/pmtiles/dzialki",
    responses={
        200: {"content": {"application/octet-stream": {}}},
        206: {"content": {"application/octet-stream": {}}},
        304: {"description": "Not modified"},
        404: {"model": ErrorResponse},
        416: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_pmtiles(
    request: Request,
    range_header: str | None = Header(default=None, alias="Range"),
) -> Response:
    settings = request.app.state.settings
    path: Path = settings.pmtiles_path_resolved

    if not path.exists() or path.stat().st_size == 0:
        raise _pmtiles_unavailable()

    total_size = path.stat().st_size
    etag = _etag_for(path)

    if_none_match = request.headers.get("If-None-Match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(
            status_code=304,
            headers={
                "ETag": etag,
                "Cache-Control": "public, max-age=3600",
            },
        )

    headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, ETag",
        "ETag": etag,
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/octet-stream",
    }

    if range_header is None:
        data = path.read_bytes()
        headers["Content-Length"] = str(len(data))
        return Response(content=data, status_code=200, headers=headers)

    parsed = _parse_range_header(range_header, total_size)
    if parsed is None:
        raise _range_unparseable(range_header)

    start, end = parsed
    length = end - start + 1
    with path.open("rb") as handle:
        handle.seek(start)
        data = handle.read(length)

    headers["Content-Length"] = str(length)
    headers["Content-Range"] = f"bytes {start}-{end}/{total_size}"
    return Response(content=data, status_code=206, headers=headers)


@router.options("/pmtiles/dzialki")
async def pmtiles_options() -> Response:
    return Response(
        status_code=204,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Max-Age": "86400",
        },
    )


__all__ = ["router"]
