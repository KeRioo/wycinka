"""Fix parcels_rtree_delete trigger: no more orphan R-tree rows (clean 0002).

Revision ID: 0002_fix_rtree_delete_trigger
Revises: 0001_initial_schema
Create Date: 2026-10-09

"""

from __future__ import annotations

from alembic import op
from app.core.db import RTREE_DELETE_TRIGGER_SQL

revision = "0002_fix_rtree_delete_trigger"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

_LEGACY_DELETE_TRIGGER_SQL = """
CREATE TRIGGER IF NOT EXISTS parcels_rtree_delete AFTER DELETE ON parcels
BEGIN
  DELETE FROM parcels_rtree_map WHERE parcel_id = OLD.id;
  DELETE FROM parcels_rtree WHERE id = (
    SELECT rtree_id FROM parcels_rtree_map WHERE parcel_id = OLD.id
  );
END;
"""


def _apply_script(sql: str) -> None:
    """Execute a multi-statement DDL script over a raw SQLite connection.

    Alembic's ``op.execute`` cannot handle trigger DDL with
    ``BEGIN...END`` composites, so we run them through
    ``sqlite3.executescript`` (same approach as 0001).
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
    conn = op.get_bind()
    conn.exec_driver_sql("DROP TRIGGER IF EXISTS parcels_rtree_delete")
    _apply_script(RTREE_DELETE_TRIGGER_SQL)
    conn.exec_driver_sql(
        "DELETE FROM parcels_rtree WHERE id NOT IN "
        "(SELECT rtree_id FROM parcels_rtree_map)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("DROP TRIGGER IF EXISTS parcels_rtree_delete")
    _apply_script(_LEGACY_DELETE_TRIGGER_SQL)
