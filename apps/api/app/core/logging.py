from __future__ import annotations

import logging
import sys
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from .config import Settings


def configure_logging(settings: Settings) -> None:
    """Configure structlog to emit JSON in production and pretty logs in dev."""

    is_dev = settings.debug
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
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        level=logging.DEBUG if is_dev else logging.INFO,
        format="%(message)s",
        stream=sys.stdout,
    )


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name) if name else structlog.get_logger()
