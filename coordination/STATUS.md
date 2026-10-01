# STATUS — co robią poszczególni agenci

> Aktualizowane przez każdego subagenta po zakończeniu zadania.

## Legenda

- `[ ]` todo
- `[~]` in progress
- `[x]` done
- `[!]` blocked

---

## Nadzorca (supervisor)

- [x] Inicjalizacja repo git
- [x] Utworzenie AGENTS.md, README.md
- [x] Definicja kontraktu API (`docs/api-contract.md`)
- [x] Definicja schematu bazy (`docs/data-schema.md`)
- [x] Plan projektu (PLAN.md, 11 sekcji)
- [ ] Koordynacja integracji po zakończeniu modułów
- [ ] Code review merge'ów do main

---

## Backend (apps/api — branch `feat/backend-scaffold`)

- [x] Szkielet FastAPI (app factory + lifespan + CORS + exception handlers)
- [x] `app/core/config.py` — pydantic-settings, env-driven, prefix `WYCINKA_`
- [x] `app/core/db.py` — aiosqlite + pełny schemat z `parcels`, `parcels_rtree`,
      `parcels_rtree_map`, `sync_meta` + triggery INSERT/DELETE
- [x] `app/core/logging.py` — structlog JSON w prod, ConsoleRenderer w dev
- [x] `app/models/parcel.py` — Pydantic v2 (extra="forbid"): ParcelDetail,
      ParcelPointResponse, AggregateResponse, SearchResponse, VersionResponse,
      ErrorResponse
- [x] `app/services/wkt_parser.py` — własny parser POLYGON / MULTIPOLYGON /
      holes; ray casting point-in-polygon; geodezyjne pole powierzchni;
      normalizacja do CCW outer / CW holes (RFC 7946)
- [x] `app/services/parcel_service.py` — get_by_point (R-tree bbox filter +
      exact pip), get_by_teryt, get_many_by_teryt, search; build_aggregate_geometry
- [x] `app/api/health.py` — `/health` + `/api/v1/version` (z ETag)
- [x] `app/api/parcels.py` — `/parcel`, `/parcel/{teryt}`, `/parcel/aggregate`
      (max 20, walidacja TERYT)
- [x] `app/api/search.py` — `/search?q=&limit=` (max 50)
- [x] `app/api/pmtiles.py` — `/pmtiles/dzialki` z HTTP Range (206),
      `Content-Range`, `Accept-Ranges`, `If-None-Match` → 304, OPTIONS CORS
- [x] `tests/fixtures/generate_sample.py` + `parcels_sample.sqlite`
      (10 działek 141201_1.0001.6501-6510 z Warszawy)
- [x] `tests/fixtures/poland_sample.pmtiles` (syntetyczny blob do testów Range)
- [x] `tests/test_*.py` — 55 testów (health, parcels, aggregate, search,
      pmtiles, wkt_parser + hypothesis property-based)
- [x] Coverage ≥ 80% (86% globalnie)
- [x] `Dockerfile` multi-stage, `python:3.12-slim`, non-root `appuser`,
      healthcheck na `/health`
- [x] `README.md` — quickstart, konfiguracja env, przykłady curl, layout

**Znalezione problemy / decyzje:**
1. **Spec R-tree w `docs/data-schema.md` jest niewykonalny w SQLite** —
   rtree wymaga INTEGER rowid dla pierwszej kolumny, nie da się wstawić
   TERYT (TEXT). Dodałem tabelę mapującą `parcels_rtree_map(parcel_id,
   rtree_id)` + odpowiedni JOIN w `parcel_service._candidates_for_point`.
   Sugestia: supervisor zaktualizuje `docs/data-schema.md` żeby opisać
   mapę (albo zostawię notatkę w REQUESTS.md).
2. **Pierścienie w EGiB przychodzą CW** — parser automatycznie normalizuje
   do CCW outer / CW holes, żeby spełnić RFC 7946. Nie rzucamy błędu.
3. **Path dla WKT ring-splitter** — drobne bugi w tokenizacji, naprawione.

**Co zostawiłem TODO dla supervisor / następnych agentów:**
- Zaktualizować `docs/data-schema.md` o mapę `parcels_rtree_map`
- Dodać Alembic migracje (obecnie: full-reload przy sync, jak mówi spec)
- Endpoint do uploadu / sync trigger (na razie dane lądują przez ETL pipeline)
- Realny plik PMTiles zostanie dostarczony przez ETL agent (scripts/sync-egib)
