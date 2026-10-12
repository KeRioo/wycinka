"""Testy równoległego stage'u tiles (per województwo) dla pipeline'u kraj."""

from __future__ import annotations

import gzip
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from egib_sync import parallel_tiles as pt
from egib_sync.parallel_tiles import (
    _merge_voivodeship_mbtiles,
    _run_tippecanoe_region,
    _split_by_voivodeship,
    main,
    run_parallel_tiles,
)


def _write_shard(staging: Path, name: str, features: list[dict[str, Any]]) -> Path:
    path = staging / name
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        for feature in features:
            fh.write(json.dumps(feature) + "\n")
    return path


def _feature(voiv: str, parcel_id: str = "0001.1") -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": parcel_id,
        "properties": {"voivodeship_code": voiv, "teryt": f"14{voiv}_.0001.{parcel_id}"},
        "geometry": None,
    }


class _FakeProc:
    def __init__(self, returncode: int = 0, stderr: str = "") -> None:
        self.returncode = returncode
        self.stderr = stderr
        self.stdout = ""


def test_split_by_voivodeship_when_shards_then_buckets_written(tmp_path: Path) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    f1 = _write_shard(staging, "kraj_dzialki.geojsonl.gz.shard0", [_feature("14"), _feature("02")])
    f2 = _write_shard(
        staging, "kraj_dzialki.geojsonl.gz.shard1", [_feature("14", "0002"), _feature("99x")]
    )

    result = _split_by_voivodeship([f1, f2], staging)

    codes = [code for code, _ in result]
    assert "14" in codes
    assert "02" in codes
    by_code = dict(result)
    with gzip.open(by_code["14"], "rt", encoding="utf-8") as fh:
        lines = fh.readlines()
    assert len(lines) == 2
    assert all(json.loads(ln)["properties"]["voivodeship_code"] == "14" for ln in lines)
    with gzip.open(by_code["02"], "rt", encoding="utf-8") as fh:
        assert len(fh.readlines()) == 1
    assert all(v.name.startswith("kraj_dzialki.voiv") for v in by_code.values())
    assert not list(staging.glob(".*tmp"))


def test_split_by_voivodeship_when_finalize_fails_then_raises_and_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    shard = _write_shard(staging, "kraj_dzialki.geojsonl.gz.shard0", [_feature("14")])

    real_replace = Path.replace
    calls: list[str] = []

    def fake_replace(self: Path, target: Path) -> Path:
        calls.append(self.name)
        if "voiv14" in self.name:
            raise OSError("boom")
        return real_replace(self, target)

    monkeypatch.setattr(pt.Path, "replace", fake_replace)

    with pytest.raises(RuntimeError) as excinfo:
        _split_by_voivodeship([shard], staging)

    assert "bucket finalize failed" in str(excinfo.value)
    assert any("voiv14" in c for c in calls)


def test_region_command_construction(tmp_path: Path) -> None:
    staging = tmp_path
    bucket = _write_shard(staging, "kraj_dzialki.voiv14.geojsonl.gz", [_feature("14")])

    captured: dict[str, Any] = {}

    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        captured["cmd"] = cmd
        (staging / "kraj-voiv14.mbtiles").write_bytes(b"mbtiles")
        return _FakeProc(0)

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", fake_run)
    try:
        _run_tippecanoe_region(
            "14",
            bucket,
            staging,
            min_zoom=12,
            max_zoom=16,
            base_zoom=15,
            layer_name="dzialki",
            tippecanoe_path="tippecanoe",
        )
    finally:
        monkey.undo()

    cmd = captured["cmd"]
    assert cmd[0] == "tippecanoe"
    assert "--base-zoom=15" in cmd
    assert "--minimum-zoom=12" in cmd
    assert "--maximum-zoom=16" in cmd
    assert "--layer=dzialki" in cmd
    assert cmd[-1] == str(bucket)
    assert not (staging / "tippecanoe-voiv14-tmp").exists()


def test_region_when_base_zoom_none_then_flag_absent(tmp_path: Path) -> None:
    staging = tmp_path
    bucket = _write_shard(staging, "kraj_dzialki.voiv02.geojsonl.gz", [_feature("02")])

    captured: dict[str, Any] = {}

    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        captured["cmd"] = cmd
        (staging / "kraj-voiv02.mbtiles").write_bytes(b"mbtiles")
        return _FakeProc(0)

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", fake_run)
    try:
        _run_tippecanoe_region(
            "02",
            bucket,
            staging,
            min_zoom=12,
            max_zoom=16,
            base_zoom=None,
            layer_name="dzialki",
            tippecanoe_path="tippecanoe",
        )
    finally:
        monkey.undo()

    assert not any(c.startswith("--base-zoom") for c in captured["cmd"])


@pytest.mark.parametrize(
    ("min_zoom", "max_zoom", "base_zoom"),
    [(-1, 5, None), (5, 23, None), (5, 10, 11)],
)
def test_region_when_invalid_zooms_then_value_error(
    tmp_path: Path, min_zoom: int, max_zoom: int, base_zoom: int | None
) -> None:
    with pytest.raises(ValueError):
        _run_tippecanoe_region(
            "14",
            tmp_path / "b.gz",
            tmp_path,
            min_zoom=min_zoom,
            max_zoom=max_zoom,
            base_zoom=base_zoom,
            layer_name="dzialki",
            tippecanoe_path="tippecanoe",
        )


def test_region_when_empty_layer_then_value_error(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        _run_tippecanoe_region(
            "14",
            tmp_path / "b.gz",
            tmp_path,
            min_zoom=12,
            max_zoom=16,
            base_zoom=None,
            layer_name="  ",
            tippecanoe_path="tippecanoe",
        )


def test_region_when_not_found_then_runtime_error(tmp_path: Path) -> None:
    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        raise FileNotFoundError("no binary")

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", fake_run)
    try:
        with pytest.raises(RuntimeError, match="tippecanoe nie znaleziony"):
            _run_tippecanoe_region(
                "14",
                tmp_path / "b.gz",
                tmp_path,
                min_zoom=12,
                max_zoom=16,
                base_zoom=None,
                layer_name="dzialki",
                tippecanoe_path="tippecanoe",
            )
    finally:
        monkey.undo()


def test_region_when_nonzero_rc_then_runtime_error(tmp_path: Path) -> None:
    staging = tmp_path
    bucket = _write_shard(staging, "kraj_dzialki.voiv14.geojsonl.gz", [_feature("14")])

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", lambda *a, **k: _FakeProc(2, stderr="ups"))
    try:
        with pytest.raises(RuntimeError, match="tippecanoe\\[14\\] rc=2"):
            _run_tippecanoe_region(
                "14",
                bucket,
                staging,
                min_zoom=12,
                max_zoom=16,
                base_zoom=15,
                layer_name="dzialki",
                tippecanoe_path="tippecanoe",
            )
    finally:
        monkey.undo()


def test_merge_when_success_then_returns_merged(tmp_path: Path) -> None:
    staging = tmp_path
    mb1 = staging / "a.mbtiles"
    mb2 = staging / "b.mbtiles"
    mb1.write_bytes(b"a")
    mb2.write_bytes(b"b")
    out = staging / "final.pmtiles"

    captured: dict[str, Any] = {}

    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        captured["cmd"] = cmd
        (staging / ".final.pmtiles.merged.mbtiles").write_bytes(b"merged")
        return _FakeProc(0)

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", fake_run)
    try:
        merged = _merge_voivodeship_mbtiles([mb1, mb2], out, "tile-join", staging)
    finally:
        monkey.undo()

    assert merged == staging / ".final.pmtiles.merged.mbtiles"
    assert captured["cmd"][0] == "tile-join"
    assert "--force" in captured["cmd"]
    assert str(mb1) in captured["cmd"]
    assert str(mb2) in captured["cmd"]


def test_merge_when_nonzero_rc_then_runtime_error(tmp_path: Path) -> None:
    staging = tmp_path
    mb1 = staging / "a.mbtiles"
    mb1.write_bytes(b"a")

    monkey = pytest.MonkeyPatch()
    monkey.setattr(pt.subprocess, "run", lambda *a, **k: _FakeProc(1, stderr="nie"))
    try:
        with pytest.raises(RuntimeError, match="tile-join rc=1"):
            _merge_voivodeship_mbtiles([mb1], staging / "out.pmtiles", "tile-join", staging)
    finally:
        monkey.undo()


def test_run_parallel_tiles_when_happy_path_then_output_and_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    shard = _write_shard(
        staging,
        "kraj_dzialki.geojsonl.gz.shard0",
        [_feature("14"), _feature("02")],
    )
    output = tmp_path / "out.pmtiles"

    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        joined = " ".join(cmd)
        if cmd[0] == "tippecanoe":
            result = Path([c for c in cmd if c.startswith("--output=")][0].split("=", 1)[1])
            result.parent.mkdir(parents=True, exist_ok=True)
            result.write_bytes(b"mbtiles-data")
            return _FakeProc(0)
        if cmd[0] == "tile-join":
            merged = Path([c for c in cmd if c.startswith("--output=")][0].split("=", 1)[1])
            merged.write_bytes(b"merged-ftiles")
            return _FakeProc(0)
        if "convert" in joined:
            Path(cmd[3]).write_bytes(b"pmtiles-magic")
            return _FakeProc(0)
        raise AssertionError(f"nieoczekiwane wywolanie: {joined}")

    monkeypatch.setattr(pt.subprocess, "run", fake_run)
    fake_pmtiles_bin = tmp_path / "pmtiles"
    fake_pmtiles_bin.write_text("#!/bin/sh\nexit 0\n")

    result = run_parallel_tiles(
        [shard],
        staging,
        output,
        jobs=2,
        tippecanoe_path="tippecanoe",
        tile_join_path="tile-join",
        pmtiles_convert_path=str(fake_pmtiles_bin),
        min_zoom=12,
        max_zoom=16,
        base_zoom=15,
    )

    assert result == output
    assert output.exists()
    assert output.read_bytes() == b"pmtiles-magic"
    assert not list(staging.glob("kraj_dzialki.voiv*"))
    assert not list(staging.glob("kraj-voiv*.mbtiles"))
    assert not list(staging.glob(".out.pmtiles*"))
    assert not list(staging.glob("tippecanoe-voiv*"))


def test_run_parallel_tiles_when_convert_missing_then_copy_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    staging = tmp_path / "staging"
    staging.mkdir()
    shard = _write_shard(staging, "kraj_dzialki.geojsonl.gz.shard0", [_feature("14")])
    output = tmp_path / "out.pmtiles"
    convert_calls: list[str] = []

    def fake_run(cmd: list[str], **kwargs: Any) -> _FakeProc:
        if cmd[0] == "tippecanoe":
            result = Path([c for c in cmd if c.startswith("--output=")][0].split("=", 1)[1])
            result.parent.mkdir(parents=True, exist_ok=True)
            result.write_bytes(b"mbtiles-data")
            return _FakeProc(0)
        if cmd[0] == "tile-join":
            merged = Path([c for c in cmd if c.startswith("--output=")][0].split("=", 1)[1])
            merged.write_bytes(b"merged")
            return _FakeProc(0)
        convert_calls.append(cmd[0])
        return _FakeProc(0)

    monkeypatch.setattr(pt.subprocess, "run", fake_run)
    convert_calls.clear()

    result = run_parallel_tiles(
        [shard],
        staging,
        output,
        jobs=1,
        pmtiles_convert_path=str(tmp_path / "brak"),
        min_zoom=12,
        max_zoom=16,
        base_zoom=15,
    )

    assert result == output
    assert output.read_bytes() == b"merged"
    assert not convert_calls


def test_main_when_no_shards_then_system_exit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    arg = [
        "prog",
        "--staging",
        str(tmp_path),
        "--output",
        str(tmp_path / "out.pmtiles"),
    ]
    monkeypatch.setattr(sys, "argv", arg)
    with pytest.raises(SystemExit, match="no shard files"):
        main()
