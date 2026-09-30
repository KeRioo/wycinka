"""Tests for retry decorator with exponential backoff."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import pytest

from egib_sync.retry import RetryError, _calculate_delay, retry


def test_calculate_delay_when_first_attempt_then_base_only() -> None:
    delay = _calculate_delay(attempt=1, base_delay=1.0, max_delay=60.0, jitter=False)
    assert delay == 1.0


def test_calculate_delay_when_second_attempt_then_doubles() -> None:
    delay = _calculate_delay(attempt=2, base_delay=1.0, max_delay=60.0, jitter=False)
    assert delay == 2.0


def test_calculate_delay_when_third_attempt_then_quadruples() -> None:
    delay = _calculate_delay(attempt=3, base_delay=1.0, max_delay=60.0, jitter=False)
    assert delay == 4.0


def test_calculate_delay_when_exceeds_max_then_capped() -> None:
    delay = _calculate_delay(attempt=10, base_delay=1.0, max_delay=10.0, jitter=False)
    assert delay == 10.0


def test_calculate_delay_when_jitter_enabled_then_in_range() -> None:
    for _ in range(50):
        delay = _calculate_delay(attempt=3, base_delay=1.0, max_delay=10.0, jitter=True)
        assert 0.0 <= delay <= 4.0


async def test_retry_when_succeeds_first_try_then_no_retry() -> None:
    calls = 0

    @retry(max_attempts=3, base_delay=0.001, max_delay=0.01)
    async def fn() -> str:
        nonlocal calls
        calls += 1
        return "ok"

    with patch("egib_sync.retry.asyncio.sleep", new=AsyncMockSleep):
        result = await fn()
    assert result == "ok"
    assert calls == 1


async def test_retry_when_fails_twice_then_succeeds_third() -> None:
    calls = 0

    @retry(max_attempts=3, base_delay=0.001, max_delay=0.01, exceptions=(ValueError,))
    async def fn() -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise ValueError("boom")
        return "ok"

    with patch("egib_sync.retry.asyncio.sleep", new=AsyncMockSleep):
        result = await fn()
    assert result == "ok"
    assert calls == 3


async def test_retry_when_exhausts_then_raises_retry_error() -> None:
    calls = 0

    @retry(max_attempts=3, base_delay=0.001, max_delay=0.01, exceptions=(ValueError,))
    async def fn() -> str:
        nonlocal calls
        calls += 1
        raise ValueError("boom")

    with patch("egib_sync.retry.asyncio.sleep", new=AsyncMockSleep), pytest.raises(
        RetryError
    ) as exc_info:
        await fn()
    assert exc_info.value.attempts == 3
    assert isinstance(exc_info.value.last_exception, ValueError)
    assert calls == 3


async def test_retry_when_unexpected_exception_then_does_not_retry() -> None:
    calls = 0

    @retry(max_attempts=3, base_delay=0.001, max_delay=0.01, exceptions=(ValueError,))
    async def fn() -> str:
        nonlocal calls
        calls += 1
        raise TypeError("not caught")

    with patch("egib_sync.retry.asyncio.sleep", new=AsyncMockSleep), pytest.raises(TypeError):
        await fn()
    assert calls == 1


async def test_retry_when_exponential_backoff_then_delays_double() -> None:
    delays: list[float] = []

    async def fake_sleep(delay: float) -> None:
        delays.append(delay)

    @retry(max_attempts=4, base_delay=0.5, max_delay=10.0, exceptions=(ValueError,), jitter=False)
    async def fn() -> str:
        raise ValueError("always fail")

    with patch("egib_sync.retry.asyncio.sleep", new=fake_sleep), pytest.raises(RetryError):
        await fn()
    assert delays == [0.5, 1.0, 2.0]


async def test_retry_preserves_function_metadata() -> None:
    @retry(max_attempts=3, base_delay=0.001, max_delay=0.01)
    async def my_special_fn() -> None:
        pass

    assert my_special_fn.__name__ == "my_special_fn"


async def AsyncMockSleep(_delay: float) -> None:  # noqa: ARG001
    return None