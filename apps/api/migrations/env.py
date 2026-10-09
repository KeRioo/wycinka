from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def _db_url() -> str:
    custom = context.config.attributes.get("db_url")
    if custom:
        return str(custom)
    env_url = os.environ.get("WYCINKA_DB_URL")
    if env_url:
        return env_url
    url = config.get_main_option("sqlalchemy.url")
    return url or "sqlite:///./data/parcels.sqlite"


def run_migrations_offline() -> None:
    context.configure(
        url=_db_url(),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import create_engine

    engine = create_engine(_db_url())
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
