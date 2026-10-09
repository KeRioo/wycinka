"""Initial schema: parcels, R-tree index, sync_meta (mirrors app.core.db).

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-09

"""

from __future__ import annotations

from alembic import op
from app.core.db import (
    PARCELS_INDEXES_SQL,
    PARCELS_SCHEMA_SQL,
    RTREE_SCHEMA_SQL,
    RTREE_TRIGGERS_SQL,
    SYNC_META_SCHEMA_SQL,
)

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

_UPGRADE_STEPS = (
    SYNC_META_SCHEMA_SQL,
    PARCELS_SCHEMA_SQL,
    PARCELS_INDEXES_SQL,
    RTREE_SCHEMA_SQL,
    RTREE_TRIGGERS_SQL,
)


def _apply_script(sql: str) -> None:
    """Execute a multi-statement DDL script over a raw SQLite connection.

    Alembic's ``op.execute`` cannot handle scripts with multiple DDL
    statements (virtual tables, triggers with ``BEGIN...END`` composits),
    so we run them through ``sqlite3.executescript``.
    """
    import sqlite3

    engine = op.get_bind().engine
    database = engine.url.database
    if database is None:
        database = ""
    conn = sqlite3.connect(database)
    try:
        conn.executescript(sql)
        conn.commit()
    finally:
        conn.close()


def upgrade() -> None:
    for script in _UPGRADE_STEPS:
        _apply_script(script)


def downgrade() -> None:
    conn = op.get_bind()
    for statement in (
        "DROP TRIGGER IF EXISTS parcels_rtree_delete",
        "DROP TRIGGER IF EXISTS parcels_rtree_insert",
        "DROP TABLE IF EXISTS parcels_rtree",
        "DROP TABLE IF EXISTS parcels_rtree_map",
        "DROP TABLE IF EXISTS parcels",
        "DROP TABLE IF EXISTS sync_meta",
    ):
        conn.exec_driver_sql(statement)
