"""Tests for the ETL pipeline orchestrator."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from egib_sync.config import Settings
from egib_sync.downloader import DownloadResult, Powiat
from egib_sync.merger import write_minimal_gpkg
from egib_sync.pipeline import (
    PipelineError,
    PipelineResult,
    backup_existing,
    cleanup_old_backups,
    restore_backup,
    run_pipeline,
    serialize_result,
)


def _fake_download_result(teryt: str, out_dir: Path) -> DownloadResult:
    p = out_dir / f"{teryt}.gpkg"
    return DownloadResult(
        powiat=Powiat(teryt=teryt, name=f"p-{teryt}", url=f"https://x/{teryt}.gpkg"),
        path=p,
        success=True,
    )


async def _fake_download(
    powiats: list[Powiat],
    out_dir: Path,
    *args: Any,
    **kwargs: Any,
) -> list[DownloadResult]:
    import geopandas as gpd
    from shapely.geometry import Polygon

    out_dir.mkdir(parents=True, exist_ok=True)
    for idx, p in enumerate(powiats):
        gpkg = out_dir / f"{p.teryt}.gpkg"
        base_lng = 21.0 + idx * 0.1
        base_lat = 52.0 + idx * 0.1
        columns = {
            "id": [f"141201_1.000{idx + 1}.{6500 + j}" for j in range(2)],
            "teryt": [f"141201_1.000{idx + 1}.{6500 + j}" for j in range(2)],
            "number": [str(6500 + j) for j in range(2)],
            "voivodeship": ["mazowieckie"] * 2,
            "voivodeship_code": ["14"] * 2,
            "county": ["Warszawa"] * 2,
            "county_code": ["1201"] * 2,
            "commune": ["Warszawa"] * 2,
            "commune_code": ["141201"] * 2,
            "region": [f"000{idx + 1}"] * 2,
            "region_name": [f"Obreb {idx + 1}"] * 2,
            "area_m2": [1500.0 + j * 100 for j in range(2)],
            "land_use": ["Ls"] * 2,
        }
        polygons = [
            Polygon(
                [
                    (base_lng + j * 0.01, base_lat + j * 0.01),
                    (base_lng + j * 0.01 + 0.005, base_lat + j * 0.01),
                    (base_lng + j * 0.01 + 0.005, base_lat + j * 0.01 + 0.005),
                    (base_lng + j * 0.01, base_lat + j * 0.01 + 0.005),
                ]
            )
            for j in range(2)
        ]
        gdf = gpd.GeoDataFrame(columns, geometry=polygons, crs="EPSG:4326")
        gdf.to_file(str(gpkg), driver="GPKG")
    return [_fake_download_result(p.teryt, out_dir) for p in powiats]


async def _fake_load_powiat_list(source: Any) -> list[Powiat]:
    return [
        Powiat(teryt="1401", name="p1", url="https://x/1401.gpkg", etag="e1401"),
        Powiat(teryt="1402", name="p2", url="https://x/1402.gpkg", etag="e1402"),
    ]


def _fake_generate_pmtiles(
    input_gpkg: Path,
    output_pmtiles: Path,
    **_: Any,
) -> Path:
    output_pmtiles.parent.mkdir(parents=True, exist_ok=True)
    output_pmtiles.write_bytes(b"FAKE-PMTILES")
    return output_pmtiles


def _fake_run_pmtiles(
    settings: Settings,
    merged_path: Path,
    *,
    dry_run: bool = False,
    stamp: str = "",
) -> Path:
    settings.pmtiles_path.parent.mkdir(parents=True, exist_ok=True)
    settings.pmtiles_path.write_bytes(b"FAKE-PMTILES")
    return settings.pmtiles_path


async def test_pipeline_dry_run_then_no_files_written(settings: Settings) -> None:
    result = await run_pipeline(settings, dry_run=True)
    assert result.success
    assert not settings.pmtiles_path.exists()
    assert not settings.sqlite_path.exists()
    assert not settings.merged_path.exists()


async def test_pipeline_skip_download_then_uses_existing(
    settings: Settings, tmp_path: Path
) -> None:
    import geopandas as gpd
    from shapely.geometry import Polygon

    settings.raw_dir.mkdir(parents=True, exist_ok=True)
    for idx, teryt in enumerate(["1401", "1402"]):
        base_lng = 21.0 + idx * 0.1
        base_lat = 52.0 + idx * 0.1
        columns = {
            "id": [f"141201_1.000{idx + 1}.{6500 + j}" for j in range(2)],
            "teryt": [f"141201_1.000{idx + 1}.{6500 + j}" for j in range(2)],
            "number": [str(6500 + j) for j in range(2)],
            "voivodeship": ["mazowieckie"] * 2,
            "voivodeship_code": ["14"] * 2,
            "county": ["Warszawa"] * 2,
            "county_code": ["1201"] * 2,
            "commune": ["Warszawa"] * 2,
            "commune_code": ["141201"] * 2,
            "region": [f"000{idx + 1}"] * 2,
            "region_name": [f"Obreb {idx + 1}"] * 2,
            "area_m2": [1500.0 + j * 100 for j in range(2)],
            "land_use": ["Ls"] * 2,
        }
        polygons = [
            Polygon(
                [
                    (base_lng + j * 0.01, base_lat + j * 0.01),
                    (base_lng + j * 0.01 + 0.005, base_lat + j * 0.01),
                    (base_lng + j * 0.01 + 0.005, base_lat + j * 0.01 + 0.005),
                    (base_lng + j * 0.01, base_lat + j * 0.01 + 0.005),
                ]
            )
            for j in range(2)
        ]
        gdf = gpd.GeoDataFrame(columns, geometry=polygons, crs="EPSG:4326")
        gdf.to_file(str(settings.raw_dir / f"{teryt}.gpkg"), driver="GPKG")

    with (
        patch("egib_sync.pipeline._run_pmtiles", side_effect=_fake_run_pmtiles),
    ):
        result = await run_pipeline(
            settings,
            skip_download=True,
            skip_pmtiles=False,
            skip_sqlite=False,
        )
    assert result.success
    assert result.parcels_count == 4
    assert settings.pmtiles_path.exists()
    assert settings.sqlite_path.exists()


async def test_pipeline_skip_download_when_no_raw_then_raises(
    settings: Settings,
) -> None:
    with pytest.raises(PipelineError, match="no .gpkg files"):
        await run_pipeline(settings, skip_download=True, skip_merge=True)


async def test_pipeline_happy_path_with_mocked_stages(
    settings: Settings,
) -> None:
    with (
        patch(
            "egib_sync.pipeline.load_powiat_list",
            side_effect=_fake_load_powiat_list,
        ),
        patch("egib_sync.pipeline.download_all_powiaty", new=_fake_download),
        patch(
            "egib_sync.pipeline.generate_pmtiles",
            side_effect=_fake_generate_pmtiles,
        ),
    ):
        result = await run_pipeline(settings)

    assert result.success
    assert result.parcels_count == 4
    assert settings.pmtiles_path.exists()
    assert settings.sqlite_path.exists()
    assert settings.merged_path.exists()
    assert len(result.raw_files) == 2


async def test_pipeline_atomicity_when_pmtiles_fails_then_sqlite_intact(
    settings: Settings,
) -> None:
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    pre_existing_sqlite = settings.sqlite_path
    pre_existing_sqlite.write_bytes(b"ORIGINAL-SQLITE")
    pre_existing_pmtiles = settings.pmtiles_path
    pre_existing_pmtiles.parent.mkdir(parents=True, exist_ok=True)
    pre_existing_pmtiles.write_bytes(b"ORIGINAL-PMTILES")

    def failing_pmtiles(*_: Any, **__: Any) -> Path:
        raise RuntimeError("pmtiles boom")

    with (
        patch(
            "egib_sync.pipeline.load_powiat_list",
            side_effect=_fake_load_powiat_list,
        ),
        patch("egib_sync.pipeline.download_all_powiaty", new=_fake_download),
        patch(
            "egib_sync.pipeline.generate_pmtiles",
            side_effect=failing_pmtiles,
        ),
    ):
        result = await run_pipeline(settings)

    assert not result.success
    assert any("pmtiles: pmtiles boom" in e for e in result.errors)
    assert pre_existing_sqlite.read_bytes() == b"ORIGINAL-SQLITE"
    assert not any(
        f.name.startswith(".") and f.name.endswith(".tmp")
        for f in settings.pmtiles_path.parent.iterdir()
        if f != pre_existing_pmtiles
    )
    stamp_dirs = list(settings.backups_dir.iterdir())
    assert stamp_dirs, "expected at least one backup stamp dir"


async def test_pipeline_atomicity_when_sqlite_fails_then_pmtiles_intact(
    settings: Settings,
) -> None:
    pre_existing_pmtiles = settings.pmtiles_path
    pre_existing_pmtiles.parent.mkdir(parents=True, exist_ok=True)
    pre_existing_pmtiles.write_bytes(b"ORIGINAL-PMTILES")
    pre_existing_sqlite = settings.sqlite_path
    pre_existing_sqlite.parent.mkdir(parents=True, exist_ok=True)
    pre_existing_sqlite.write_bytes(b"ORIGINAL-SQLITE")

    def failing_sqlite(*_: Any, **__: Any) -> int:
        raise RuntimeError("sqlite boom")

    with (
        patch(
            "egib_sync.pipeline.load_powiat_list",
            side_effect=_fake_load_powiat_list,
        ),
        patch("egib_sync.pipeline.download_all_powiaty", new=_fake_download),
        patch(
            "egib_sync.pipeline.generate_pmtiles",
            side_effect=_fake_generate_pmtiles,
        ),
        patch(
            "egib_sync.pipeline._run_sqlite",
            side_effect=failing_sqlite,
        ),
    ):
        result = await run_pipeline(settings)

    assert not result.success
    assert any("sqlite: sqlite boom" in e for e in result.errors)
    assert pre_existing_pmtiles.read_bytes() == b"ORIGINAL-PMTILES"


async def test_pipeline_powiat_prefix_is_forwarded_to_download(
    settings: Settings,
) -> None:
    captured_prefix: dict[str, Any] = {}

    async def capturing_download(
        settings_obj: Settings,
        *,
        powiat_prefix: str | None,
        powiat_list_source: Any,
        dry_run: bool,
    ) -> tuple[list[Path], dict[str, Any], str]:
        captured_prefix["prefix"] = powiat_prefix
        return [], {"skipped": True}, "noop"

    with (
        patch("egib_sync.pipeline._run_download", side_effect=capturing_download),
        patch(
            "egib_sync.pipeline._run_merge",
            side_effect=lambda *a, **k: a[0].merged_path,
        ),
    ):
        result = await run_pipeline(
            settings,
            powiat_prefix="14",
            skip_download=False,
            skip_merge=True,
            skip_pmtiles=True,
            skip_sqlite=True,
        )
    assert captured_prefix["prefix"] == "14"
    assert result.errors == []


async def test_pipeline_dry_run_then_settings_not_mutated(
    settings: Settings,
) -> None:
    await run_pipeline(settings, dry_run=True)
    assert not settings.sqlite_path.exists()
    assert not settings.pmtiles_path.exists()
    assert not settings.merged_path.exists()


async def test_pipeline_local_powiat_list_source_then_used(
    settings: Settings, tmp_path: Path
) -> None:
    src = tmp_path / "powiat_list.json"
    src.write_text(
        json.dumps(
            [
                {"teryt": "1401", "name": "p", "url": "https://x/1401.gpkg"},
            ]
        ),
        encoding="utf-8",
    )

    with (
        patch("egib_sync.pipeline.download_all_powiaty", new=_fake_download),
        patch(
            "egib_sync.pipeline.generate_pmtiles",
            side_effect=_fake_generate_pmtiles,
        ),
    ):
        result = await run_pipeline(settings, powiat_list_source=src)
    assert result.success


def test_backup_existing_when_file_present_then_copies(tmp_path: Path) -> None:
    src = tmp_path / "x.gpkg"
    src.write_bytes(b"X")
    backup = backup_existing(src, backup_dir=tmp_path / "bk", stamp="20260101T000000Z")
    assert backup is not None
    assert backup.read_bytes() == b"X"


def test_backup_existing_when_file_missing_then_none(tmp_path: Path) -> None:
    src = tmp_path / "x.gpkg"
    backup = backup_existing(src, backup_dir=tmp_path / "bk", stamp="20260101T000000Z")
    assert backup is None


def test_restore_backup_when_present_then_restores(tmp_path: Path) -> None:
    bk = tmp_path / "bk.gpkg"
    bk.write_bytes(b"BACKUP")
    target = tmp_path / "target.gpkg"
    assert restore_backup(bk, target) is True
    assert target.read_bytes() == b"BACKUP"


def test_restore_backup_when_missing_then_false(tmp_path: Path) -> None:
    assert restore_backup(tmp_path / "x", tmp_path / "y") is False


def test_cleanup_old_backups_keeps_n_newest(tmp_path: Path) -> None:
    bk = tmp_path / "bk"
    for stamp in ("20260101T000000Z", "20260102T000000Z", "20260103T000000Z"):
        d = bk / stamp
        d.mkdir(parents=True)
        (d / "x.gpkg").write_bytes(b"X")
    removed = cleanup_old_backups(bk, keep=1)
    assert removed == 2
    remaining = sorted(p.name for p in bk.iterdir())
    assert remaining == ["20260103T000000Z"]


def test_cleanup_old_backups_when_empty_dir_then_zero(tmp_path: Path) -> None:
    bk = tmp_path / "bk"
    bk.mkdir()
    assert cleanup_old_backups(bk, keep=5) == 0


def test_cleanup_old_backups_when_dir_missing_then_zero(tmp_path: Path) -> None:
    assert cleanup_old_backups(tmp_path / "nope", keep=2) == 0


def test_serialize_result_when_called_then_includes_all_keys(
    tmp_path: Path,
) -> None:
    result = PipelineResult(
        pmtiles_path=tmp_path / "p.pmtiles",
        sqlite_path=tmp_path / "s.sqlite",
        merged_path=tmp_path / "m.gpkg",
        raw_files=[],
        parcels_count=42,
        started_at=__import__("datetime").datetime(2026, 9, 30, tzinfo=__import__("datetime").timezone.utc),
        finished_at=__import__("datetime").datetime(2026, 9, 30, 1, tzinfo=__import__("datetime").timezone.utc),
        errors=[],
    )
    payload = json.loads(serialize_result(result))
    assert payload["parcels_count"] == 42
    assert payload["success"] is True
    assert payload["errors"] == []
    assert "pmtiles_path" in payload


def test_pipeline_result_success_property() -> None:
    from datetime import datetime, timezone

    base = PipelineResult(
        pmtiles_path=Path("/x"),
        sqlite_path=Path("/y"),
        merged_path=Path("/z"),
        raw_files=[],
        parcels_count=0,
        started_at=datetime(2026, 9, 30, tzinfo=timezone.utc),
        finished_at=datetime(2026, 9, 30, 1, tzinfo=timezone.utc),
    )
    assert base.success is True
    base.errors.append("oops")
    assert base.success is False


async def test_pipeline_atomicity_when_merge_fails_then_no_pmtiles_sqlite(
    settings: Settings,
) -> None:
    settings.pmtiles_path.parent.mkdir(parents=True, exist_ok=True)
    settings.pmtiles_path.write_bytes(b"PRE-PMTILES")
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    settings.sqlite_path.write_bytes(b"PRE-SQLITE")

    def failing_merge(*_: Any, **__: Any) -> Path:
        raise RuntimeError("merge boom")

    with (
        patch(
            "egib_sync.pipeline.load_powiat_list",
            side_effect=_fake_load_powiat_list,
        ),
        patch("egib_sync.pipeline.download_all_powiaty", new=_fake_download),
        patch("egib_sync.pipeline._run_merge", side_effect=failing_merge),
    ):
        result = await run_pipeline(settings)

    assert not result.success
    assert any("merge: merge boom" in e for e in result.errors)
    assert settings.pmtiles_path.read_bytes() == b"PRE-PMTILES"
    assert settings.sqlite_path.read_bytes() == b"PRE-SQLITE"


def _async_return(value: Any) -> Any:
    async def _impl(*_args: Any, **_kwargs: Any) -> Any:
        return value

    return _impl
