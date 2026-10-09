"""Powiat list and GPKG downloader with retry + concurrency control."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import aiofiles
import httpx

from egib_sync.config import DownloadSettings
from egib_sync.logging import get_logger
from egib_sync.retry import RetryError, retry

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Powiat:
    """A powiat (county) with its source URL and metadata."""

    teryt: str
    name: str
    url: str
    etag: str | None = None
    size_bytes: int | None = None


@dataclass(frozen=True, slots=True)
class DownloadResult:
    """Outcome of downloading a single powiat GPKG."""

    powiat: Powiat
    path: Path
    success: bool
    error: str | None = None
    attempts: int = 1


class DownloadError(RuntimeError):
    """Raised when a powiat cannot be downloaded after all retries."""


async def load_powiat_list(source: Path | str) -> list[Powiat]:
    """Load powiat list from a local JSON file or remote URL.

    File format: list of dicts with keys ``teryt``, ``name``, ``url``, optional
    ``etag`` and ``size_bytes``.
    """
    if isinstance(source, (str, Path)) and not str(source).startswith(("http://", "https://")):
        path = Path(source)
        async with aiofiles.open(path, "rb") as f:
            data = await f.read()
        return _parse_powiat_list_json(data)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(str(source))
        response.raise_for_status()
        return _parse_powiat_list_json(response.content)


def _parse_powiat_list_json(data: bytes) -> list[Powiat]:
    import json

    raw = json.loads(data)
    if not isinstance(raw, list):
        raise ValueError("powiat list must be a JSON array")
    out: list[Powiat] = []
    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("each powiat entry must be an object")
        teryt = entry.get("teryt")
        url = entry.get("url")
        name = entry.get("name", "")
        if not teryt or not url:
            raise ValueError(f"missing teryt/url in powiat entry: {entry!r}")
        out.append(
            Powiat(
                teryt=str(teryt),
                name=str(name),
                url=str(url),
                etag=entry.get("etag"),
                size_bytes=entry.get("size_bytes"),
            )
        )
    return out


def filter_powiaty(powiats: Iterable[Powiat], prefix: str | None) -> list[Powiat]:
    """Filter powiats by TERYT prefix. Returns all when ``prefix`` is None/empty."""
    if not prefix:
        return list(powiats)
    return [p for p in powiats if p.teryt.startswith(prefix)]


@retry(
    max_attempts=3,
    base_delay=1.0,
    max_delay=60.0,
    exceptions=(httpx.HTTPError,),
)
async def fetch_with_retry(client: httpx.AsyncClient, url: str) -> bytes:
    """Single HTTP GET with retries (decorator applies backoff)."""
    response = await client.get(url)
    response.raise_for_status()
    return response.content


async def _download_one(
    powiat: Powiat,
    output_dir: Path,
    *,
    settings: DownloadSettings,
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
) -> DownloadResult:
    out_path = output_dir / f"{powiat.teryt}.gpkg"
    if out_path.exists() and out_path.stat().st_size > 0:
        logger.debug("download_skip_exists", teryt=powiat.teryt, path=str(out_path))
        return DownloadResult(powiat=powiat, path=out_path, success=True)

    async with semaphore:
        try:
            content = await fetch_with_retry(client, powiat.url)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = out_path.with_suffix(out_path.suffix + ".part")
            async with aiofiles.open(tmp_path, "wb") as f:
                await f.write(content)
            tmp_path.replace(out_path)
            logger.info(
                "download_ok",
                teryt=powiat.teryt,
                bytes=len(content),
                path=str(out_path),
            )
            return DownloadResult(powiat=powiat, path=out_path, success=True)
        except RetryError as exc:
            logger.error(
                "download_failed",
                teryt=powiat.teryt,
                url=powiat.url,
                error=str(exc.last_exception),
                attempts=exc.attempts,
            )
            return DownloadResult(
                powiat=powiat,
                path=out_path,
                success=False,
                error=str(exc.last_exception),
                attempts=exc.attempts,
            )
        except (OSError, httpx.HTTPError) as exc:
            logger.error(
                "download_failed",
                teryt=powiat.teryt,
                url=powiat.url,
                error=str(exc),
                attempts=1,
            )
            return DownloadResult(
                powiat=powiat,
                path=out_path,
                success=False,
                error=str(exc),
                attempts=1,
            )


async def download_powiat(
    teryt: str,
    output_dir: Path,
    *,
    url: str | None = None,
    settings: DownloadSettings | None = None,
) -> Path:
    """Download GPKG for a single powiat (convenience wrapper)."""
    settings = settings or DownloadSettings()
    url = url or f"https://example.com/egib/{teryt}.gpkg"
    powiat = Powiat(teryt=teryt, name=teryt, url=url)
    timeout = httpx.Timeout(settings.timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        semaphore = asyncio.Semaphore(1)
        result = await _download_one(
            powiat, output_dir, settings=settings, client=client, semaphore=semaphore
        )
    if not result.success:
        raise DownloadError(f"failed to download {teryt}: {result.error}")
    return result.path


async def download_all_powiaty(
    powiats: list[Powiat],
    output_dir: Path,
    *,
    settings: DownloadSettings | None = None,
    concurrency: int | None = None,
) -> list[DownloadResult]:
    """Download all powiats in parallel with bounded concurrency."""
    settings = settings or DownloadSettings()
    max_concurrent = concurrency or settings.concurrency
    timeout = httpx.Timeout(settings.timeout_seconds)
    semaphore = asyncio.Semaphore(max_concurrent)
    output_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = [
            asyncio.create_task(
                _download_one(
                    powiat,
                    output_dir,
                    settings=settings,
                    client=client,
                    semaphore=semaphore,
                )
            )
            for powiat in powiats
        ]
        results = await asyncio.gather(*tasks, return_exceptions=False)
    return results


def summarize_results(results: Iterable[DownloadResult]) -> dict[str, Any]:
    """Aggregate download outcomes into a small summary dict."""
    items = list(results)
    ok = [r for r in items if r.success]
    failed = [r for r in items if not r.success]
    return {
        "total": len(items),
        "ok": len(ok),
        "failed": len(failed),
        "failed_teryt": [r.powiat.teryt for r in failed],
    }
