"""Tests for the PMTiles generator (tippecanoe wrapper)."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import HealthCheck, given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from egib_sync.pmtiles_gen import (
    TippecanoeError,
    TippecanoeNotFoundError,
    _build_command,
    _resolve_tippecanoe,
    generate_pmtiles,
)


@pytest.fixture
def fake_gpkg(tmp_path: Path) -> Path:
    p = tmp_path / "input.gpkg"
    p.write_bytes(b"PK\x03\x04" + b"\x00" * 64)
    return p


@pytest.fixture
def out_pmtiles(tmp_path: Path) -> Path:
    return tmp_path / "output.pmtiles"


@pytest.fixture(autouse=True)
def skip_gpkg_conversion(monkeypatch: Any):
    """Subprocess is mocked in these tests; disable the GPKG→GeoJSONSeq step."""
    monkeypatch.setattr("egib_sync.pmtiles_gen._gpkg_to_geojsonl", lambda gpkg, out: gpkg)


def _ok_completed_process() -> MagicMock:
    cp = MagicMock(spec=subprocess.CompletedProcess)
    cp.returncode = 0
    cp.stdout = ""
    cp.stderr = ""
    return cp


def _fail_completed_process(returncode: int = 1, stderr: str = "boom") -> MagicMock:
    cp = MagicMock(spec=subprocess.CompletedProcess)
    cp.returncode = returncode
    cp.stdout = ""
    cp.stderr = stderr
    return cp


def test_generate_pmtiles_when_input_missing_then_raises(tmp_path: Path, out_pmtiles: Path) -> None:
    with pytest.raises(FileNotFoundError):
        generate_pmtiles(tmp_path / "nope.gpkg", out_pmtiles)


def test_generate_pmtiles_when_tippecanoe_missing_then_raises(
    fake_gpkg: Path, out_pmtiles: Path, tmp_path: Path
) -> None:
    with (
        patch("egib_sync.pmtiles_gen.shutil.which", return_value=None),
        pytest.raises(TippecanoeNotFoundError, match="tippecanoe binary not found"),
    ):
        generate_pmtiles(
            fake_gpkg,
            out_pmtiles,
            tippecanoe_path=str(tmp_path / "no-such-bin"),
        )


def test_generate_pmtiles_when_tippecanoe_explicit_path_missing_then_raises(
    fake_gpkg: Path, out_pmtiles: Path, tmp_path: Path
) -> None:
    with pytest.raises(TippecanoeNotFoundError):
        generate_pmtiles(
            fake_gpkg,
            out_pmtiles,
            tippecanoe_path=str(tmp_path / "no-such-bin"),
        )


def test_generate_pmtiles_when_tippecanoe_fails_then_raises_and_no_output(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    fake_bin = Path("/usr/local/bin/tippecanoe")
    with (
        patch(
            "egib_sync.pmtiles_gen.subprocess.run",
            return_value=_fail_completed_process(returncode=1, stderr="bad"),
        ),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=str(fake_bin)),
    ):
        with pytest.raises(TippecanoeError, match="tippecanoe failed"):
            generate_pmtiles(fake_gpkg, out_pmtiles)
    assert not out_pmtiles.exists()


def test_generate_pmtiles_when_success_then_output_exists_and_atomic(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        out_arg = next(c for c in cmd if c.startswith("--output="))
        out_path = Path(out_arg.split("=", 1)[1])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"PMTILES-FAKE-CONTENT")
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
    ):
        result = generate_pmtiles(fake_gpkg, out_pmtiles)

    assert result == out_pmtiles
    assert out_pmtiles.exists()
    assert out_pmtiles.read_bytes() == b"PMTILES-FAKE-CONTENT"
    assert not (out_pmtiles.parent / f".{out_pmtiles.name}.tmp").exists()


def test_generate_pmtiles_writes_to_tmp_not_final_path(fake_gpkg: Path, out_pmtiles: Path) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"
    captured_cmd: dict[str, Any] = {}

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        captured_cmd["cmd"] = list(cmd)
        out_arg = next(c for c in cmd if c.startswith("--output="))
        out_path = Path(out_arg.split("=", 1)[1])
        out_path.write_bytes(b"FAKE")
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles)

    out_arg = next(c for c in captured_cmd["cmd"] if c.startswith("--output="))
    assert out_arg == f"--output={out_pmtiles.parent / ('.' + out_pmtiles.name + '.tmp')}"


def test_generate_pmtiles_passes_correct_flags_to_subprocess(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"
    captured_cmd: dict[str, Any] = {}

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        captured_cmd["cmd"] = list(cmd)
        out_arg = next(c for c in cmd if c.startswith("--output="))
        Path(out_arg.split("=", 1)[1]).write_bytes(b"X")
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
    ):
        generate_pmtiles(
            fake_gpkg,
            out_pmtiles,
            min_zoom=5,
            max_zoom=17,
            base_zoom=12,
            layer_name="parcelki",
        )

    cmd = captured_cmd["cmd"]
    assert cmd[0] == fake_bin
    assert "--minimum-zoom=5" in cmd
    assert "--maximum-zoom=17" in cmd
    assert "--base-zoom=12" in cmd
    assert "--layer=parcelki" in cmd
    assert "--force" in cmd
    assert "--drop-densest-as-needed" in cmd
    assert "--extend-zooms-if-still-dropping" in cmd
    assert cmd[-1] == str(fake_gpkg)


def test_generate_pmtiles_when_drop_densest_false_then_no_flag(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"
    captured_cmd: dict[str, Any] = {}

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        captured_cmd["cmd"] = list(cmd)
        out_arg = next(c for c in cmd if c.startswith("--output="))
        Path(out_arg.split("=", 1)[1]).write_bytes(b"X")
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles, drop_densest=False, extend_zooms=False)

    cmd = captured_cmd["cmd"]
    assert "--drop-densest-as-needed" not in cmd
    assert "--extend-zooms-if-still-dropping" not in cmd


def test_generate_pmtiles_uses_settings_path_when_provided(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    fake_bin = "/custom/path/to/tippecanoe"

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        out_arg = next(c for c in cmd if c.startswith("--output="))
        Path(out_arg.split("=", 1)[1]).write_bytes(b"X")
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin) as r,
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles, tippecanoe_path="/custom/path/to/tippecanoe")
    r.assert_called_once_with("/custom/path/to/tippecanoe")


def test_generate_pmtiles_when_subprocess_oserror_then_raises_tippecanoe_not_found(
    fake_gpkg: Path, out_pmtiles: Path
) -> None:
    def fake_run(*_: Any, **__: Any) -> subprocess.CompletedProcess[str]:
        raise OSError("no exec")

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch(
            "egib_sync.pmtiles_gen._resolve_tippecanoe",
            return_value="/usr/local/bin/tippecanoe",
        ),
        pytest.raises(TippecanoeNotFoundError),
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles)


def test_generate_pmtiles_when_no_output_then_raises(fake_gpkg: Path, out_pmtiles: Path) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"

    def fake_run(*_: Any, **__: Any) -> subprocess.CompletedProcess[str]:
        return _ok_completed_process()

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
        pytest.raises(TippecanoeError, match="no output"),
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles)


def test_generate_pmtiles_failure_cleans_up_tmp(fake_gpkg: Path, out_pmtiles: Path) -> None:
    fake_bin = "/usr/local/bin/tippecanoe"

    def fake_run(cmd: list[str], check: bool = False, **_: Any) -> subprocess.CompletedProcess[str]:
        out_arg = next(c for c in cmd if c.startswith("--output="))
        Path(out_arg.split("=", 1)[1]).write_bytes(b"partial")
        return _fail_completed_process(returncode=2, stderr="err")

    with (
        patch("egib_sync.pmtiles_gen.subprocess.run", side_effect=fake_run),
        patch("egib_sync.pmtiles_gen._resolve_tippecanoe", return_value=fake_bin),
        pytest.raises(TippecanoeError),
    ):
        generate_pmtiles(fake_gpkg, out_pmtiles)
    assert not out_pmtiles.exists()


def test_build_command_when_invalid_zoom_range_then_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="invalid zoom range"):
        _build_command(
            input_gpkg=tmp_path / "i.gpkg",
            output_pmtiles=tmp_path / "o.pmtiles",
            tippecanoe="tippecanoe",
            min_zoom=10,
            max_zoom=5,
            base_zoom=12,
            layer_name="dzialki",
            drop_densest=True,
            extend_zooms=True,
        )


def test_build_command_when_base_zoom_out_of_range_then_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="base_zoom"):
        _build_command(
            input_gpkg=tmp_path / "i.gpkg",
            output_pmtiles=tmp_path / "o.pmtiles",
            tippecanoe="tippecanoe",
            min_zoom=4,
            max_zoom=18,
            base_zoom=20,
            layer_name="dzialki",
            drop_densest=True,
            extend_zooms=True,
        )


def test_build_command_when_empty_layer_then_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="layer_name"):
        _build_command(
            input_gpkg=tmp_path / "i.gpkg",
            output_pmtiles=tmp_path / "o.pmtiles",
            tippecanoe="tippecanoe",
            min_zoom=4,
            max_zoom=18,
            base_zoom=14,
            layer_name="   ",
            drop_densest=True,
            extend_zooms=True,
        )


def test_resolve_tippecanoe_when_path_then_validates_existence(tmp_path: Path) -> None:
    real = tmp_path / "tip"
    real.write_bytes(b"#!/bin/sh\n")
    assert _resolve_tippecanoe(str(real)) == str(real)

    missing = tmp_path / "no"
    with pytest.raises(TippecanoeNotFoundError):
        _resolve_tippecanoe(str(missing))


def test_resolve_tippecanoe_when_in_path(tmp_path: Path) -> None:
    real = tmp_path / "tippecanoe"
    real.write_bytes(b"#!/bin/sh\n")
    with patch("egib_sync.pmtiles_gen.shutil.which", return_value=str(real)):
        assert _resolve_tippecanoe("tippecanoe") == str(real)


def test_resolve_tippecanoe_when_not_in_path(tmp_path: Path) -> None:
    with patch("egib_sync.pmtiles_gen.shutil.which", return_value=None):
        with pytest.raises(TippecanoeNotFoundError):
            _resolve_tippecanoe("tippecanoe")


@given(
    min_zoom=st.integers(min_value=0, max_value=22),
    max_zoom=st.integers(min_value=0, max_value=22),
    base_zoom=st.integers(min_value=0, max_value=22),
    layer_name=st.text(min_size=1, max_size=32).filter(lambda s: s.strip() != ""),
)
@hyp_settings(
    max_examples=50,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
def test_build_command_property_random_zooms(
    min_zoom: int,
    max_zoom: int,
    base_zoom: int,
    layer_name: str,
) -> None:
    base = Path("/tmp")
    if min_zoom > max_zoom:
        with pytest.raises(ValueError):
            _build_command(
                input_gpkg=base / "i.gpkg",
                output_pmtiles=base / "o.pmtiles",
                tippecanoe="tippecanoe",
                min_zoom=min_zoom,
                max_zoom=max_zoom,
                base_zoom=base_zoom,
                layer_name=layer_name,
                drop_densest=True,
                extend_zooms=True,
            )
        return
    if not (min_zoom <= base_zoom <= max_zoom):
        with pytest.raises(ValueError):
            _build_command(
                input_gpkg=base / "i.gpkg",
                output_pmtiles=base / "o.pmtiles",
                tippecanoe="tippecanoe",
                min_zoom=min_zoom,
                max_zoom=max_zoom,
                base_zoom=base_zoom,
                layer_name=layer_name,
                drop_densest=True,
                extend_zooms=True,
            )
        return
    cmd = _build_command(
        input_gpkg=base / "i.gpkg",
        output_pmtiles=base / "o.pmtiles",
        tippecanoe="tippecanoe",
        min_zoom=min_zoom,
        max_zoom=max_zoom,
        base_zoom=base_zoom,
        layer_name=layer_name,
        drop_densest=True,
        extend_zooms=True,
    )
    assert f"--minimum-zoom={min_zoom}" in cmd
    assert f"--maximum-zoom={max_zoom}" in cmd
    assert f"--base-zoom={base_zoom}" in cmd
    assert f"--layer={layer_name}" in cmd
    assert "--force" in cmd
