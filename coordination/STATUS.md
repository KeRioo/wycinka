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

## Frontend (`apps/web/`, branch `feat/frontend-scaffold`)

- [x] Scaffold Vite 5 + React 18 + TypeScript 5 (strict, alias `@/*`)
- [x] Tailwind 3 z motywem forest (forest/bark/cream/stone) + postcss/autoprefixer
- [x] ESLint 9 + typescript-eslint strict-type-checked + Prettier
- [x] Vitest + Testing Library + MSW + fake-indexeddb (jsdom)
- [x] Playwright (chromium, port 5173, webServer `npm run dev`)
- [x] React Router v6: `/`, `/map`, 404
- [x] Header z nawigacją + UI primitives (Button, Card, Input)
- [x] HomePage + NotFound
- [x] API client `ky` z retry, typy zgodne z `docs/api-contract.md`, `ApiError` z mapowaniem kodów
- [x] Dexie schema (`wycinka` v1): `projects` + `trees` + helpers + `runMigrations`
- [x] Zustand `useMapStore` (selectedParcel, pendingPoint, loading, error, highlightLayerId)
- [x] MapLibre + pmtiles: `usePMTiles` hook + `MapView` z OSM base + warstwa `dzialki` + highlight layer
- [x] `MapClickHandler` → `api.getParcelByPoint` → `ParcelPopup` (TERYT, numer, admin, pow., centroid)
- [x] `MapPage` z loaderem, error card, flyTo centroid, maplibre Popup
- [x] PWA: vite-plugin-pwa, manifest (theme `#15803d`, lang `pl`), workbox CacheFirst dla PMTiles + API
- [x] Dockerfile multi-stage `node:20-alpine` → `nginx:1.27-alpine` (non-root, HEALTHCHECK)
- [x] nginx.conf: SPA fallback, gzip, immutable assets, no-cache dla sw.js + /healthz
- [x] README.md w `apps/web/`
- [x] Testy jednostkowe: **75 testów / 14 plików**, coverage **86.63% lines / 90.32% funcs / 79.11% branches**
  - `api.test.ts` (14), `db.test.ts` (7), `usePMTiles.test.ts` (6), `useGeolocation.test.ts` (5),
    `useAPI.test.ts` (3), `utils.test.ts` (9), `api.types.test.ts` (5),
    `App.test.tsx` (2), `HomePage.test.tsx` (3), `MapPage.test.tsx` (5), `ParcelPopup.test.tsx` (3),
    `Card.test.tsx` (3), `Input.test.tsx` (4), `mapStore.test.ts` (6)
- [x] Testy E2E (Playwright): `map.spec.ts` (4) + `navigation.spec.ts` (1) — mockowane API
- [x] `npm run typecheck` — czysto
- [x] `npm run lint` — czysto (0 warnings/errors)
- [x] `npm run build` — sukces (PWA precache 19 entries, 1112 KiB)

### TODO (dla kolejnych agentów / follow-up)

- Prawdziwe PNG ikony PWA (obecnie SVG placeholdery) — designer/agent UI
- Implementacja FAB i panelu dodawania drzewa (GPS + strzałki 25cm)
- Widok mapy projektu (markery drzew kolor/wielkość, popup drzewa)
- Kreator PDF (jsPDF + html2canvas, obrót 0-90°, kompas, tabela zbiorcza)
- Backup/restore JSON
- Service Worker testy (symulowany offline mode via MSW)
- react-hook-form + zod integracja w formularzach
- Lazy-load mapy (dynamic import w MapPage) — opcjonalnie dla zmniejszenia initial bundle

### Notatki dla innych agentów

- **Backend:** klient API zakłada bazowy URL `${VITE_API_URL}` (np. `http://localhost:8000/api/v1`).
  Health idzie pod `${VITE_API_URL}/../health` (czyli `/health`).
- **Backend:** typy TypeScript w `apps/web/src/services/api.types.ts` są lustrzanym odbiciem kontraktu
  — każda zmiana `docs/api-contract.md` wymaga aktualizacji obu stron.
- **Backend:** klient `ky` używa retry 2x dla 408/429/500/502/503/504 na GET.
- **Infra:** CORS — frontend oczekuje `Access-Control-Allow-Origin: *` (lub konkretna domena)
  dla wszystkich endpointów API w dev.
- **Wszyscy:** env vars: `VITE_API_URL`, `VITE_PMTILES_URL` (drugi fallback do `${VITE_API_URL}/pmtiles/dzialki`).

---

## Backend (`apps/api/`, branch `feat/backend-scaffold`)

- [x] Scaffold FastAPI + SQLAlchemy 2.0 async + Alembic
- [x] Konfiguracja przez pydantic-settings
- [x] Endpointy zgodne z `docs/api-contract.md`
- [x] WKT parser (Polygon + MultiPolygon)
- [x] SQLite z R-tree
- [x] PMTiles Range request handler
- [x] Testy end-to-end
- [x] Dockerfile + README

---

## Infra (`infra/`, branch `feat/infra-scaffold`)

- [x] docker-compose production
- [x] cloudflared config
- [x] nginx alternative
- [x] Backup / init / healthcheck scripts
- [x] Walidacja konfiguracji
- [x] README w `infra/`

---

## ETL (`scripts/sync-egib/`, branch `feat/etl-scaffold`)

- [x] Scaffold z config, logging, retry
- [x] Foundation pod download GPKG


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
