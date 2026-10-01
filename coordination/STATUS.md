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
- [x] Sync `docs/` z implementacją (commit `2bebd98`) — R-tree map, dodatkowe pola ParcelDetail, sekcja 8 Uwagi implementacyjne
- [x] Code review 4 branchów
- [x] Merge 4 feature branchów do main
- [ ] Koordynacja dalszej implementacji (FAB, PDF, ikony PWA, etc.)

---

## Backend (subagent: backend)

Branch: `feat/backend-scaffold`

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

**Coverage:** 86% (szczegóły w `apps/api/README.md`)

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
- [x] Testy E2E (Playwright): `map.spec.ts` (4) + `navigation.spec.ts` (1) — mockowane API
- [x] `npm run typecheck` — czysto
- [x] `npm run lint` — czysto (0 warnings/errors)
- [x] `npm run build` — sukces (PWA precache 19 entries, 1112 KiB)

### TODO (dla kolejnych agentów / follow-up)

- Prawdziwe PNG ikony PWA (obecnie SVG placeholdery)
- Implementacja FAB i panelu dodawania drzewa (GPS + strzałki 25cm)
- Widok mapy projektu (markery drzew kolor/wielkość, popup drzewa)
- Kreator PDF (jsPDF + html2canvas, obrót 0-90°, kompas, tabela zbiorcza)
- Backup/restore JSON
- Service Worker testy (symulowany offline mode via MSW)
- react-hook-form + zod integracja w formularzach
- Lazy-load mapy (dynamic import w MapPage)
- **Aktualizacja `api.types.ts`:** dodać `voivodeship_code`, `county_code`, `commune_code`, `datasource` do `Parcel` interface (po sync contractu)

---

## Infra (`infra/`, branch `feat/infra-scaffold`)

- [x] `docker-compose.yml` — produkcja (api, web, caddy, cloudflared)
- [x] `docker-compose.dev.yml` — dev z hot reload
- [x] `.env.example` — domeny, porty, TUNNEL_ID
- [x] `caddy/Caddyfile` — reverse proxy z PMTiles Range support + nagłówki bezpieczeństwa
- [x] `caddy/Dockerfile` — multi-stage z opcjonalnym pluginem Cloudflare DNS
- [x] `nginx/` — alternatywa dla Caddy (pełna konfiguracja + Dockerfile, non-root)
- [x] `cloudflared/config.yml.example` — szablon z placeholder `<TUNNEL_ID>`
- [x] `cloudflared/README.md` — pełna instrukcja konfiguracji tunelu (login, create, route dns, rotate)
- [x] `scripts/init-data.sh` — tworzy katalogi `data/{pmtiles,sqlite,backups,etl-staging}`
- [x] `scripts/backup.sh` — rotacyjne backupy SQLite (online API) + PMTiles (cp), retencja 7 dni
- [x] `scripts/healthcheck.sh` — sprawdza kontenery + endpointy + nagłówek Accept-Ranges
- [x] `tests/` — 33 testy walidacji (compose, Caddyfile, cloudflared config), 31 OK + 2 skipped (brak docker/caddy CLI)
- [x] `README.md` — quickstart, routing, architektura, troubleshooting

**Pinned images:** cloudflare/cloudflared:2024.5.0, caddy:2-alpine, nginx:1.27-alpine, node:20-alpine
**Wszystkie serwisy:** restart: unless-stopped + healthcheck (oprócz cloudflared)

### TODO

- **Dodać ETL jako kontener w compose** (cron co tydzień + volume do api-data) — obecnie ETL standalone
- **Wire healthcheck w Caddy** do nowego endpointu `/health` (już jest, ale warto przetestować)
- **Dokumentacja operational runbook** (deploy, rollback, monitoring)
- **Migracja Caddyfile do wersji z auto-HTTPS** (Cloudflare DNS plugin)

---

## ETL (`scripts/sync-egib/`, branch `feat/etl-scaffold`)

- [x] `egib_sync/__init__.py` + `egib_sync/config.py` — Pydantic Settings, env override (`EGIB_*`)
- [x] `egib_sync/logging.py` — structlog (JSON production, pretty dev), idempotent
- [x] `egib_sync/retry.py` — exponential backoff helper (testowane property-based)
- [x] `egib_sync/downloader.py` — powiat list download + concurrent GPKG download (respx mockowane)
- [x] `egib_sync/merger.py` — atomic merge do `merged.gpkg`, walidacja schematu
- [x] `egib_sync/pmtiles_gen.py` — wrapper `tippecanoe` z timeout i error classification
- [x] `egib_sync/sqlite_loader.py` — import do SQLite z R-tree i `sync_meta`
- [x] `egib_sync/pipeline.py` — orchestracja 4 etapów z atomicity i rollback
- [x] `egib_sync/__main__.py` — CLI entrypoint: `--powiat`, `--skip-*`, `--dry-run`, `--report`
- [x] `tests/test_cli.py` — 11 testów CLI (help, dry-run, report, log level, exit codes 0/1/2/130)
- [x] `README.md` — quickstart, stages, atomicity, troubleshooting
- [x] `.gitignore` — `coverage.xml` zignorowany globalnie

**Coverage:** 93.9% (143 testy zielone — 132 istniejące + 11 CLI)
**CLI exit codes:** 0 = sukces, 1 = wyjątek, 2 = częściowy sukces, 130 = Ctrl+C

### TODO

- **Prawdziwy URL do listy powiatów** — obecnie mockowany; integracja z `https://www.geoportal.gov.pl/pl/dane/ewidencja-gruntow-i-budynkow-egib`
- **tippecanoe install w Dockerfile** — najlepiej multi-stage z budowaniem ze źródeł (~10 min) lub gotowy obraz
- **Dodać ETL jako kontener** w `infra/docker-compose.yml` (cron job)
- **Monitoring sync** (np. pushover/telegram alert na błąd)
- **Dane z LPIS** jako fallback (`/api/v1/pmtiles/dzialki` zawiera warstwę LPIS z geoportal.gov)
- **Kompresja raw GPKG** po merge (zostawiaj ostatni do debug)

---

## Notatki końcowe (po merge'u)

- Wszystkie 4 branche zmergowane do main.
- Pliki `apps/`, `infra/`, `scripts/` są kompletne i przetestowane.
- Brak środowiska Docker na dev PC — testy E2E i integracja odłożone.
- Następne kroki: implementacja funkcji (FAB, PDF, drzewa) na bazie istniejących scaffoldów.
