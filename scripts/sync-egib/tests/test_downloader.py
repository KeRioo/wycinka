"""Tests for the powiat downloader."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
import respx

from egib_sync.config import DownloadSettings
from egib_sync.downloader import (
    DownloadError,
    DownloadResult,
    Powiat,
    download_all_powiaty,
    download_powiat,
    filter_powiaty,
    load_powiat_list,
    summarize_results,
)


def test_filter_powiaty_when_no_prefix_then_returns_all() -> None:
    powiats = [
        Powiat(teryt="1401", name="p1", url="u1"),
        Powiat(teryt="2201", name="p2", url="u2"),
    ]
    assert len(filter_powiaty(powiats, None)) == 2
    assert len(filter_powiaty(powiats, "")) == 2


def test_filter_powiaty_when_prefix_matches_then_returns_subset() -> None:
    powiats = [
        Powiat(teryt="1401", name="p1", url="u1"),
        Powiat(teryt="1402", name="p2", url="u2"),
        Powiat(teryt="2201", name="p3", url="u3"),
    ]
    matched = filter_powiaty(powiats, "14")
    assert [p.teryt for p in matched] == ["1401", "1402"]


def test_filter_powiaty_when_prefix_no_match_then_empty() -> None:
    powiats = [Powiat(teryt="2201", name="p", url="u")]
    assert filter_powiaty(powiats, "99") == []


async def test_load_powiat_list_when_local_file_then_parses_json(
    powiat_list_file: Path,
) -> None:
    powiats = await load_powiat_list(powiat_list_file)
    assert len(powiats) == 10
    assert all(isinstance(p, Powiat) for p in powiats)
    assert powiats[0].teryt == "1400"
    assert powiats[0].url.startswith("https://")


async def test_load_powiat_list_when_remote_url_then_parses(
    respx_mock: respx.MockRouter,
) -> None:
    data = [{"teryt": "1401", "name": "p", "url": "https://x/1401.gpkg"}]
    respx_mock.get("https://example.com/list.json").mock(
        return_value=httpx.Response(200, content=json.dumps(data).encode())
    )
    powiats = await load_powiat_list("https://example.com/list.json")
    assert len(powiats) == 1
    assert powiats[0].teryt == "1401"


async def test_load_powiat_list_when_malformed_then_raises(
    powiat_list_file: Path,
) -> None:
    bad = powiat_list_file.parent / "bad.json"
    bad.write_text('{"not": "a list"}', encoding="utf-8")
    with pytest.raises(ValueError, match="JSON array"):
        await load_powiat_list(bad)


async def test_load_powiat_list_when_missing_teryt_then_raises(
    tmp_path: Path,
) -> None:
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps([{"name": "x", "url": "https://x/y"}]), encoding="utf-8")
    with pytest.raises(ValueError, match="missing teryt/url"):
        await load_powiat_list(bad)


async def test_download_powiat_when_success_then_writes_file(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
) -> None:
    respx_mock.get("https://example.com/egib/1401.gpkg").mock(
        return_value=httpx.Response(200, content=fake_gpkg_bytes)
    )
    out = await download_powiat("1401", tmp_path)
    assert out.exists()
    assert out.read_bytes() == fake_gpkg_bytes


async def test_download_powiat_when_404_then_raises(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
) -> None:
    respx_mock.get("https://example.com/egib/1401.gpkg").mock(
        return_value=httpx.Response(404)
    )
    with pytest.raises(DownloadError):
        await download_powiat("1401", tmp_path)


async def test_download_all_powiaty_when_concurrent_then_all_downloaded(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
    mock_powiat_list: list[dict[str, object]],
) -> None:
    powiats = [
        Powiat(teryt=str(d["teryt"]), name=str(d["name"]), url=str(d["url"]))
        for d in mock_powiat_list
    ]
    for p in powiats:
        respx_mock.get(p.url).mock(
            return_value=httpx.Response(200, content=fake_gpkg_bytes)
        )

    settings = DownloadSettings(concurrency=3, max_retries=2, backoff_base_seconds=0.001)
    results = await download_all_powiaty(powiats, tmp_path, settings=settings)

    assert len(results) == len(powiats)
    assert all(r.success for r in results)
    assert all((tmp_path / f"{p.teryt}.gpkg").exists() for p in powiats)


async def test_download_all_powiaty_when_one_fails_then_others_continue(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
    mock_powiat_list: list[dict[str, object]],
) -> None:
    powiats = [
        Powiat(teryt=str(d["teryt"]), name=str(d["name"]), url=str(d["url"]))
        for d in mock_powiat_list
    ]
    for idx, p in enumerate(powiats):
        if idx == 4:
            respx_mock.get(p.url).mock(return_value=httpx.Response(503))
        else:
            respx_mock.get(p.url).mock(
                return_value=httpx.Response(200, content=fake_gpkg_bytes)
            )

    settings = DownloadSettings(concurrency=5, max_retries=2, backoff_base_seconds=0.001)
    results = await download_all_powiaty(powiats, tmp_path, settings=settings)

    summary = summarize_results(results)
    assert summary["total"] == len(powiats)
    assert summary["ok"] == len(powiats) - 1
    assert summary["failed"] == 1
    assert summary["failed_teryt"][0] == powiats[4].teryt


async def test_download_all_powiaty_when_skip_existing_then_no_http_call(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
) -> None:
    powiats = [Powiat(teryt="1401", name="p", url="https://x/1401.gpkg")]
    (tmp_path / "1401.gpkg").write_bytes(fake_gpkg_bytes)

    respx_mock.get(powiats[0].url).mock(return_value=httpx.Response(200, content=b""))

    results = await download_all_powiaty(powiats, tmp_path)
    assert len(results) == 1
    assert results[0].success
    assert respx_mock.calls.call_count == 0


async def test_download_all_powiaty_when_concurrency_bounded_then_respects_limit(
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
) -> None:
    powiats = [
        Powiat(teryt=f"140{i}", name="p", url=f"https://x/{i}.gpkg") for i in range(20)
    ]
    for p in powiats:
        respx_mock.get(p.url).mock(
            return_value=httpx.Response(200, content=fake_gpkg_bytes)
        )

    settings = DownloadSettings(concurrency=2, max_retries=1, backoff_base_seconds=0.001)
    results = await download_all_powiaty(powiats, tmp_path, settings=settings)
    assert len(results) == 20
    assert all(r.success for r in results)


async def test_download_all_powiaty_when_input_empty_then_returns_empty(
    tmp_path: Path,
) -> None:
    results = await download_all_powiaty([], tmp_path)
    assert results == []


def test_summarize_results_when_all_success_then_zero_failed() -> None:
    results = [
        DownloadResult(
            powiat=Powiat(teryt="1401", name="p", url="u"), path=Path("x"), success=True
        )
    ]
    summary = summarize_results(results)
    assert summary == {
        "total": 1,
        "ok": 1,
        "failed": 0,
        "failed_teryt": [],
    }


def test_summarize_results_when_mixed_then_correct_counts() -> None:
    results = [
        DownloadResult(
            powiat=Powiat(teryt="1401", name="p", url="u"), path=Path("x"), success=True
        ),
        DownloadResult(
            powiat=Powiat(teryt="1402", name="p", url="u"),
            path=Path("x"),
            success=False,
            error="boom",
        ),
    ]
    summary = summarize_results(results)
    assert summary["total"] == 2
    assert summary["ok"] == 1
    assert summary["failed"] == 1
    assert summary["failed_teryt"] == ["1402"]


@pytest.mark.parametrize("input_teryt", ["1401", "2201", "3005"])
async def test_download_powiat_param_when_various_teryt_then_routes_correctly(
    input_teryt: str,
    respx_mock: respx.MockRouter,
    tmp_path: Path,
    fake_gpkg_bytes: bytes,
) -> None:
    respx_mock.get(f"https://example.com/egib/{input_teryt}.gpkg").mock(
        return_value=httpx.Response(200, content=fake_gpkg_bytes)
    )
    out = await download_powiat(input_teryt, tmp_path)
    assert out.name == f"{input_teryt}.gpkg"


async def test_load_powiat_list_from_http_status_error(
    respx_mock: respx.MockRouter,
) -> None:
    respx_mock.get("https://example.com/list.json").mock(return_value=httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await load_powiat_list("https://example.com/list.json")