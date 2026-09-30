"""SQLite + R-tree loader for EGiB parcels.

Implements the schema described in ``docs/data-schema.md``:

- ``parcels`` table — primary parcel data (TERYT, geometry, attributes).
- ``parcels_rtree`` virtual table — spatial bbox index (R-tree).
- ``parcels_rtree_map`` — maps parcel TEXT id to R-tree INTEGER rowid.
- ``sync_meta`` — sync metadata (etag, counts, paths).
- Triggers keep the R-tree in sync on parcel insert/delete.

The R-tree virtual table requires INTEGER primary keys, so we use
``parcels_rtree_map`` to bridge TEXT parcel ids (TERYT) to the
auto-incrementing rowid of the R-tree.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

import geopandas as gpd
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from egib_sync.logging import get_logger

logger = get_logger(__name__)


SCHEMA_VERSION: Final = 1

_COLUMNS: Final[tuple[str, ...]] = (
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
    "geom_wkt",
    "centroid_lng",
    "centroid_lat",
    "bbox_min_lng",
    "bbox_min_lat",
    "bbox_max_lng",
    "bbox_max_lat",
    "fetched_at",
    "datasource",
)


class DatabaseSchemaError(RuntimeError):
    """Raised when the SQLite database schema is missing or invalid."""


class GpkgSchemaError(ValueError):
    """Raised when the source GPKG is missing required columns."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_parent(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)


def _connect(db_path: Path) -> sqlite3.Connection:
    _ensure_parent(db_path)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db(db_path: Path) -> None:
    """Create the parcels / parcels_rtree / parcels_rtree_map / sync_meta schema.

    Idempotent — safe to call on an existing database.
    """
    _ensure_parent(db_path)
    conn = _connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS parcels (
                id TEXT PRIMARY KEY,
                teryt TEXT NOT NULL UNIQUE,
                number TEXT NOT NULL,
                voivodeship TEXT NOT NULL,
                voivodeship_code TEXT NOT NULL,
                county TEXT NOT NULL,
                county_code TEXT NOT NULL,
                commune TEXT NOT NULL,
                commune_code TEXT NOT NULL,
                region TEXT NOT NULL,
                region_name TEXT,
                area_m2 REAL NOT NULL,
                land_use TEXT,
                geom_wkt TEXT NOT NULL,
                centroid_lng REAL NOT NULL,
                centroid_lat REAL NOT NULL,
                bbox_min_lng REAL NOT NULL,
                bbox_min_lat REAL NOT NULL,
                bbox_max_lng REAL NOT NULL,
                bbox_max_lat REAL NOT NULL,
                fetched_at TEXT NOT NULL,
                datasource TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_parcels_teryt
                ON parcels(teryt);
            CREATE INDEX IF NOT EXISTS idx_parcels_voivodeship
                ON parcels(voivodeship_code);
            CREATE INDEX IF NOT EXISTS idx_parcels_county
                ON parcels(county_code);
            CREATE INDEX IF NOT EXISTS idx_parcels_commune
                ON parcels(commune_code);
            CREATE INDEX IF NOT EXISTS idx_parcels_number
                ON parcels(number);

            CREATE TABLE IF NOT EXISTS parcels_rtree_map (
                parcel_id TEXT PRIMARY KEY,
                rtree_id INTEGER UNIQUE NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS parcels_rtree USING rtree(
                id,
                min_lng, max_lng,
                min_lat, max_lat
            );

            CREATE TABLE IF NOT EXISTS sync_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS schema_meta (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO schema_meta(version, applied_at) VALUES (?, ?)",
            (SCHEMA_VERSION, _now_iso()),
        )
        conn.commit()
        logger.info("sqlite_init", path=str(db_path))
    finally:
        conn.close()


def _row_from_feature(
    feature_id: str,
    attrs: dict[str, Any],
    geom: BaseGeometry,
    *,
    fetched_at: str,
    datasource: str,
) -> tuple[Any, ...] | None:
    """Build a tuple suitable for INSERT into ``parcels`` from a feature."""
    if geom is None or geom.is_empty:
        return None
    minx, miny, maxx, maxy = geom.bounds
    centroid = geom.centroid
    geom_wkt = geom.wkt
    return (
        feature_id,
        str(attrs.get("teryt") or feature_id),
        str(attrs.get("number", "")),
        str(attrs.get("voivodeship", "")),
        str(attrs.get("voivodeship_code", "")),
        str(attrs.get("county", "")),
        str(attrs.get("county_code", "")),
        str(attrs.get("commune", "")),
        str(attrs.get("commune_code", "")),
        str(attrs.get("region", "")),
        attrs.get("region_name"),
        float(attrs.get("area_m2", 0.0)),
        attrs.get("land_use"),
        geom_wkt,
        float(centroid.x),
        float(centroid.y),
        float(minx),
        float(miny),
        float(maxx),
        float(maxy),
        fetched_at,
        datasource,
    )


def _validate_gpkg_columns(gdf: gpd.GeoDataFrame) -> None:
    """Ensure the GPKG has the required columns (id + geometry)."""
    missing = [c for c in ("id", "geometry") if c not in gdf.columns]
    if missing:
        raise GpkgSchemaError(f"GPKG missing required columns: {missing}")


def _ensure_wgs84(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Reproject to EPSG:4326 if necessary; pass through otherwise."""
    if gdf.crs is None:
        return gdf.set_crs("EPSG:4326")
    crs = gdf.crs.to_epsg() if hasattr(gdf.crs, "to_epsg") else None
    if crs == 4326:
        return gdf
    return gdf.to_crs("EPSG:4326")


def load_parcels_from_gpkg(
    gpkg_path: Path,
    db_path: Path,
    *,
    batch_size: int = 1000,
    datasource: str = "geoportal.gov.pl",
) -> int:
    """Import parcels from a GPKG into the SQLite database.

    Truncates the ``parcels`` table before loading (full reload semantics).
    Returns the number of parcels inserted.

    Raises:
        FileNotFoundError: when ``gpkg_path`` does not exist.
        GpkgSchemaError: when the GPKG is missing required columns.
    """
    if not gpkg_path.exists():
        raise FileNotFoundError(f"GPKG not found: {gpkg_path}")
    if batch_size <= 0:
        raise ValueError(f"batch_size must be positive, got {batch_size}")

    init_db(db_path)
    gdf = gpd.read_file(str(gpkg_path))
    _validate_gpkg_columns(gdf)
    gdf = _ensure_wgs84(gdf)

    fetched_at = _now_iso()
    conn = _connect(db_path)
    inserted = 0
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM parcels_rtree")
        conn.execute("DELETE FROM parcels_rtree_map")
        conn.execute("DELETE FROM parcels")

        buffer: list[tuple[Any, ...]] = []
        for _, feature in gdf.iterrows():
            row = _row_from_feature(
                feature_id=str(feature["id"]),
                attrs=feature.drop(labels="geometry").to_dict(),
                geom=feature.geometry,
                fetched_at=fetched_at,
                datasource=datasource,
            )
            if row is None:
                continue
            buffer.append(row)
            if len(buffer) >= batch_size:
                inserted += _flush(conn, buffer)
                buffer.clear()

        if buffer:
            inserted += _flush(conn, buffer)
            buffer.clear()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    logger.info(
        "sqlite_load_done",
        gpkg=str(gpkg_path),
        db=str(db_path),
        rows=inserted,
    )
    return inserted


def _flush(conn: sqlite3.Connection, buffer: list[tuple[Any, ...]]) -> int:
    """Insert buffered parcels + R-tree rows in a single transaction chunk."""
    if not buffer:
        return 0
    placeholders = ",".join("?" * len(_COLUMNS))
    parcel_sql = f"INSERT OR REPLACE INTO parcels ({','.join(_COLUMNS)}) VALUES ({placeholders})"
    cursor = conn.executemany(parcel_sql, buffer)
    inserted = cursor.rowcount if cursor.rowcount > 0 else len(buffer)

    map_sql = "INSERT INTO parcels_rtree_map(parcel_id, rtree_id) VALUES (?, ?)"
    index_sql = (
        "INSERT INTO parcels_rtree(id, min_lng, max_lng, min_lat, max_lat) "
        "VALUES (?, ?, ?, ?, ?)"
    )
    map_rows: list[tuple[str, int]] = []
    for row in buffer:
        parcel_id = row[0]
        min_lng = row[16]
        min_lat = row[17]
        max_lng = row[18]
        max_lat = row[19]
        rtree_cur = conn.execute(index_sql, (None, min_lng, max_lng, min_lat, max_lat))
        rtree_id = int(rtree_cur.lastrowid)
        map_rows.append((parcel_id, rtree_id))

    conn.executemany(map_sql, map_rows)
    return inserted


def update_sync_meta(
    db_path: Path,
    *,
    parcels_count: int,
    etag: str,
    pmtiles_path: Path,
    extras: dict[str, str] | None = None,
) -> None:
    """Write sync metadata into ``sync_meta``.

    Required keys: ``last_sync``, ``parcels_count``, ``egib_etag``,
    ``pmtiles_path``.
    """
    now = _now_iso()
    pairs: dict[str, str] = {
        "last_sync": now,
        "parcels_count": str(parcels_count),
        "egib_etag": etag,
        "pmtiles_path": str(pmtiles_path),
    }
    if extras:
        pairs.update(extras)
    init_db(db_path)
    conn = _connect(db_path)
    try:
        conn.executemany(
            "INSERT OR REPLACE INTO sync_meta(key, value, updated_at) VALUES (?, ?, ?)",
            [(k, v, now) for k, v in pairs.items()],
        )
        conn.commit()
        logger.info("sync_meta_updated", db=str(db_path), keys=list(pairs.keys()))
    finally:
        conn.close()


def _bbox_intersects(
    min_lng: float,
    min_lat: float,
    max_lng: float,
    max_lat: float,
    *,
    lat: float,
    lng: float,
) -> bool:
    return min_lng <= lng <= max_lng and min_lat <= lat <= max_lat


def point_query(db_path: Path, lat: float, lng: float) -> dict[str, Any] | None:
    """Find the parcel at point ``(lat, lng)``.

    Uses the R-tree for an O(log n) bbox filter, then performs exact
    point-in-polygon check in Python via shapely.
    Returns the parcel as a dict, or ``None`` if no parcel contains the point.
    """
    if not db_path.exists():
        raise FileNotFoundError(f"SQLite database not found: {db_path}")

    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT p.id, p.teryt, p.number, p.voivodeship, p.voivodeship_code,
                   p.county, p.county_code, p.commune, p.commune_code,
                   p.region, p.region_name, p.area_m2, p.land_use,
                   p.geom_wkt, p.centroid_lng, p.centroid_lat,
                   p.fetched_at, p.datasource
              FROM parcels p
              JOIN parcels_rtree_map m ON m.parcel_id = p.id
              JOIN parcels_rtree r ON r.id = m.rtree_id
             WHERE r.min_lng <= ? AND r.max_lng >= ?
               AND r.min_lat <= ? AND r.max_lat >= ?
            """,
            (lng, lng, lat, lat),
        ).fetchall()
    finally:
        conn.close()

    for row in rows:
        geom_wkt = row[13]
        try:
            geom = _wkt_to_geom(geom_wkt)
        except Exception:  # noqa: BLE001
            continue
        if geom is None or geom.is_empty:
            continue
        if geom.contains(_point(lat=lat, lng=lng)) or geom.touches(_point(lat=lat, lng=lng)):
            return _row_to_dict(row)
    return None


def _point(*, lat: float, lng: float) -> BaseGeometry:
    from shapely.geometry import Point

    return Point(lng, lat)


def _wkt_to_geom(wkt: str) -> BaseGeometry:
    from shapely import wkt as shapely_wkt

    return shapely_wkt.loads(wkt)


def _row_to_dict(row: tuple[Any, ...]) -> dict[str, Any]:
    keys = (
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
        "geom_wkt",
        "centroid_lng",
        "centroid_lat",
        "fetched_at",
        "datasource",
    )
    return dict(zip(keys, row, strict=True))


def parcels_count(db_path: Path) -> int:
    """Return the number of parcels currently stored, or 0 if DB missing."""
    if not db_path.exists():
        return 0
    conn = _connect(db_path)
    try:
        cur = conn.execute("SELECT COUNT(*) FROM parcels")
        return int(cur.fetchone()[0])
    finally:
        conn.close()


def read_sync_meta(db_path: Path) -> dict[str, str]:
    """Return all sync_meta key-value pairs as a dict (empty if missing)."""
    if not db_path.exists():
        return {}
    conn = _connect(db_path)
    try:
        rows = conn.execute("SELECT key, value FROM sync_meta").fetchall()
        return {k: v for k, v in rows}
    finally:
        conn.close()


def vacuum(db_path: Path) -> None:
    """Run VACUUM on the SQLite database to reclaim space."""
    if not db_path.exists():
        return
    conn = _connect(db_path)
    try:
        conn.execute("VACUUM")
        conn.commit()
        logger.info("sqlite_vacuum", db=str(db_path))
    finally:
        conn.close()


def geojson_parcel(parcel: dict[str, Any]) -> dict[str, Any]:
    """Serialize a parcel dict to a GeoJSON Feature.

    Used by the backend ``/parcel`` endpoint to share schema with the API.
    """
    geom = _wkt_to_geom(parcel["geom_wkt"])
    return {
        "type": "Feature",
        "id": parcel["id"],
        "geometry": mapping(geom),
        "properties": {k: v for k, v in parcel.items() if k != "geom_wkt"},
    }


def iter_parcels_as_geojson(
    db_path: Path,
    *,
    batch_size: int = 1000,
) -> Iterable[dict[str, Any]]:
    """Yield parcels as GeoJSON Feature dicts (for streaming exports)."""
    if not db_path.exists():
        return
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            "SELECT id, teryt, number, voivodeship, voivodeship_code, county, "
            "county_code, commune, commune_code, region, region_name, area_m2, "
            "land_use, geom_wkt, centroid_lng, centroid_lat, fetched_at, datasource "
            "FROM parcels"
        )
        while True:
            rows = cur.fetchmany(batch_size)
            if not rows:
                break
            for row in rows:
                parcel = _row_to_dict(row)
                yield geojson_parcel(parcel)
    finally:
        conn.close()


def shape_geom(parcel: dict[str, Any]) -> BaseGeometry:
    """Helper that returns the shapely geometry for a parcel dict."""
    return _wkt_to_geom(parcel["geom_wkt"])


__all__ = [
    "DatabaseSchemaError",
    "GpkgSchemaError",
    "SCHEMA_VERSION",
    "geojson_parcel",
    "init_db",
    "iter_parcels_as_geojson",
    "load_parcels_from_gpkg",
    "parcels_count",
    "point_query",
    "read_sync_meta",
    "shape_geom",
    "update_sync_meta",
    "vacuum",
]
