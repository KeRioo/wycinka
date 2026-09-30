"""Retry decorator with exponential backoff + jitter for async/sync callables."""

from __future__ import annotations

import asyncio
import functools
import random
from collections.abc import Awaitable, Callable
from typing import Any, ParamSpec, TypeVar

from egib_sync.logging import get_logger

logger = get_logger(__name__)

P = ParamSpec("P")
R = TypeVar("R")


class RetryError(RuntimeError):
    """Raised when all retry attempts are exhausted."""

    def __init__(self, attempts: int, last_exception: BaseException) -> None:
        super().__init__(
            f"Operation failed after {attempts} attempts; last error: {last_exception!r}"
        )
        self.attempts = attempts
        self.last_exception = last_exception


def _calculate_delay(
    attempt: int, base_delay: float, max_delay: float, jitter: bool
) -> float:
    expo = base_delay * (2 ** (attempt - 1))
    capped = min(expo, max_delay)
    if jitter:
        capped = random.uniform(0, capped)
    return capped


def retry(
    *,
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exceptions: tuple[type[BaseException], ...] = (Exception,),
    jitter: bool = True,
) -> Callable[[Callable[P, Awaitable[R]]], Callable[P, Awaitable[R]]]:
    """Decorator factory for async callables with exponential backoff retry.

    On exhaustion wraps the last exception in ``RetryError``.
    """

    def decorator(fn: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
        @functools.wraps(fn)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            last_exc: BaseException | None = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return await fn(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt >= max_attempts:
                        break
                    delay = _calculate_delay(attempt, base_delay, max_delay, jitter)
                    logger.warning(
                        "retry_attempt",
                        fn=fn.__name__,
                        attempt=attempt,
                        max_attempts=max_attempts,
                        delay=delay,
                        error=str(exc),
                        error_type=type(exc).__name__,
                    )
                    await asyncio.sleep(delay)
            assert last_exc is not None
            logger.error(
                "retry_exhausted", fn=fn.__name__, attempts=max_attempts
            )
            raise RetryError(max_attempts, last_exc) from last_exc

        return wrapper

    return decorator


async def sleep_with_jitter(base: float, jitter: float = 0.1) -> None:
    """Sleep ``base`` seconds with up to ``jitter`` fraction of random extra."""
    extra = random.uniform(0.0, jitter * base) if jitter > 0 else 0.0
    await asyncio.sleep(base + extra)


__all__ = ["RetryError", "retry", "sleep_with_jitter", "Any"]