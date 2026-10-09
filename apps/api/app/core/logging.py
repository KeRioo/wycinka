from __future__ import annotations

import logging
import sys
from typing import IO, TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from .config import Settings


def _open_log_stream(settings: Settings) -> IO[str]:
    """Dev logs go to stdout; production writes structured logs to a file."""
    if settings.debug:
        return sys.stdout
    path = settings.log_file_resolved
    path.parent.mkdir(parents=True, exist_ok=True)
    return open(path, "a", encoding="utf-8", buffering=1, errors="replace")


def configure_logging(settings: Settings) -> None:
    """Configure structlog: pretty console logs in dev, JSON to wycinka.log in prod."""

    is_dev = settings.debug
    stream = _open_log_stream(settings)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if is_dev:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if is_dev else logging.INFO,
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=stream),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        level=logging.DEBUG if is_dev else logging.INFO,
        format="%(message)s",
        stream=stream,
    )


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name) if name else structlog.get_logger()
