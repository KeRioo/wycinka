from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence


class ParcelStorage(Protocol):
    """Storage interface used by the API layer (SQLite or PostGIS backend)."""

    backend: str

    async def ready(self) -> bool:
        """Cheap readiness probe (file existence for SQLite, SELECT 1 for Postgres)."""
        ...

    async def has_data(self) -> bool:
        """Whether the parcels table is populated / queryable."""
        ...

    async def get_point_candidates(self, lat: float, lng: float) -> Sequence[Mapping[str, Any]]:
        """Rows whose bbox may contain the point, cheapest first (small area)."""
        ...

    async def get_by_teryt(self, teryt: str) -> Mapping[str, Any] | None: ...

    async def get_many_by_teryt(self, teryt_list: Sequence[str]) -> Sequence[Mapping[str, Any]]: ...

    async def search_teryt_prefix(self, prefix: str, limit: int) -> Sequence[Mapping[str, Any]]: ...

    async def get_sync_meta(self, key: str) -> str | None: ...

    async def set_sync_meta(self, key: str, value: str) -> None: ...

    async def is_available(self) -> bool: ...

    async def close(self) -> None: ...
