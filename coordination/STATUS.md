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

## Infra (subagent: infra)

Branch: `feat/infra-scaffold`

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
**Caddy depends_on:** api (healthy) + web (healthy)
**Cloudflared depends_on:** caddy (healthy)
**Non-root user:** w caddy i nginx Dockerfile

DoD:
- [x] `docker compose config` dla obu compose'ów (CLI niedostępne lokalnie — walidowane przez testy)
- [x] Wszystkie serwisy mają healthcheck (oprócz cloudflared)
- [x] Wszystkie obrazy mają pinned wersje (cloudflared:2024.5.0)
- [x] Wszystkie serwisy mają `restart: unless-stopped`
- [x] Non-root user w custom Dockerfile (caddy, nginx)
- [x] Multi-stage build (caddy: xcaddy builder + caddy runtime)
- [x] Caddyfile kieruje /api → api, resztę → web
- [x] cloudflared config: placeholder `<TUNNEL_ID>`, credentials w `.gitignore`
- [x] README wyjaśnia produkcję i dev
- [x] 33 testy przechodzą (2 skipped - CLI)
- [x] STATUS.md zaktualizowany

**Znalezione problemy / uwagi dla innych agentów:**

1. **Koordynacja branch'y:** W trakcie pracy kilkukrotnie inne agenty przełączyły mi branch podczas wykonywania komend, co spowodowało utratę plików z working tree. Praca była bezpieczna w git (zatwierdzona), ale pliki po drodze znikały. Rekomendacja dla przyszłych agentów: commitować natychmiast po każdym pliku, nie czekać.

2. **Dla backendu:** `docker-compose.yml` oczekuje `Dockerfile` w `apps/api/` i serwuje API na porcie 8000. Healthcheck: `httpx.get('/health')` zwraca 200. Endpointy: `/health`, `/api/v1/parcel`, `/api/v1/search`, `/api/v1/pmtiles/dzialki`, `/api/v1/version`.

3. **Dla frontendu:** `docker-compose.yml` oczekuje `Dockerfile` w `apps/web/` serwujący statyczne pliki na porcie 80 (w produkcji — multi-stage build). `Dockerfile.dev` dla dev compose z hot reload.

4. **Dla ETL:** Katalogi runtime: `data/pmtiles/`, `data/sqlite/`, `data/etl-staging/`. Volume `api-data` jest zamontowany w kontenerze api jako `/app/data`. SQLite z R-tree oczekiwany w `data/sqlite/parcels.sqlite`, PMTiles w `data/pmtiles/dzialki.pmtiles`.

---

## Backend (subagent: backend)

Branch: `feat/backend-scaffold`

- [x] FastAPI app structure (`apps/api/`)
- [x] SQLite + R-tree (`parcels`, `parcels_rtree`, `parcels_rtree_map`, `sync_meta`, triggery)
- [x] PMTiles serving z HTTP Range (`/api/v1/pmtiles/dzialki` — 200/206/304/416, ETag, CORS)
- [x] `/health` i `/api/v1/version`
- [x] `/api/v1/parcel?lat&lng` (point query, R-tree + exact pip)
- [x] `/api/v1/parcel/{teryt}` (walidacja formatu TERYT)
- [x] `/api/v1/parcel/aggregate?id=…` (max 20 IDs, Polygon/MultiPolygon)
- [x] `/api/v1/search?q=&limit=` (prefix LIKE)
- [x] WKT parser (POLYGON, holes, MULTIPOLYGON, normalizacja CW→CCW)
- [x] Pydantic v2 models (`ParcelResponse`, `ApiError`, etc.)
- [x] Pydantic Settings + structlog
- [x] aiosqlite (async DB access)
- [x] Sample fixtures (10 działek z Warszawy, test PMTiles blob)
- [x] Dockerfile multi-stage (python:3.12-slim, non-root, healthcheck)
- [x] Testy: 55/55, coverage 86%

**Coverage:**
- models/parcel.py: 100%
- core/logging.py: 100%
- core/config.py: 97%
- api/search.py: 95%
- api/pmtiles.py: 93% (Range/ETag/304/416/503/CORS)
- api/parcels.py: 88%
- api/health.py: 82%
- main.py: 88%
- services/parcel_service: 87%
- services/wkt_parser: 79%
- core/db.py: 76%
- **TOTAL: 86%**

**ruff check:** All checks passed
**mypy --strict:** no issues found in 16 source files

DoD:
- [x] Wszystkie endpointy z `docs/api-contract.md` zaimplementowane
- [x] PMTiles Range requests
- [x] WKT parser z testami property-based (hypothesis)
- [x] Coverage ≥ 80%
- [x] ruff + mypy strict bez błędów
- [x] pytest wszystkie zielone
- [x] Dockerfile multi-stage
- [x] README w `apps/api/README.md`

**Znalezione problemy / uwagi dla innych agentów:**

1. **R-tree w SQLite:** pierwsza kolumna rtree musi być INTEGER rowid, więc `docs/data-schema.md` wymaga aktualizacji. Backend używa tabeli mapującej `parcels_rtree_map(parcel_id TEXT, rtree_id INTEGER UNIQUE)` + JOIN w `parcel_service._candidates_for_point`. **UWAGA: docs/data-schema.md jest jeszcze nieaktualny** — schema różni się od tego co zrobiliśmy. Nadzorca powinien to zsynchronizować przed ETL użyje tego samego wzorca.

2. **EGiB zwraca pierścienie CW** — parser automatycznie normalizuje do CCW outer / CW holes (RFC 7946). Testowane w `test_parse_polygon_when_outer_is_clockwise_normalizes_to_ccw`.

3. **Alembic migracje:** pominięte (full-reload bazy za każdym sync, jak w data-schema.md §Migracje).

4. **Rate limiting:** 60 req/s per IP — wymaga warstwy nginx/cloudflared (infra). Backend sam tego nie robi.

5. **Dockerfile:** nie był testowany lokalnie (brak dockera w PATH). Składniowo poprawny.

---

## Frontend (subagent: frontend)

Branch: `feat/frontend-scaffold`

- [x] Vite 5 + React 18 + TypeScript 5 (strict, no `any`, alias `@/*`)
- [x] Tailwind 3 z motywem forest (forest/bark/cream/stone)
- [x] React Router v6, Zustand, ky, Dexie, MapLibre + pmtiles, vite-plugin-pwa
- [x] Klient API 1:1 z `docs/api-contract.md` (discriminated union `ParcelResponse`, `ApiError` z mapowaniem status→code)
- [x] Dexie schema: `projects`, `trees`, 17 gatunków PL (stała lista), 7 przedziałów obwodu
- [x] `MapView` z OSM base + warstwa `dzialki` + highlight + klik → API → popup
- [x] Dockerfile multi-stage (node:20-alpine → nginx:1.27-alpine, non-root, HEALTHCHECK)
- [x] nginx.conf: SPA fallback, gzip, immutable assets, no-cache dla sw.js
- [x] 14 plików testów jednostkowych (Vitest + Testing Library + MSW + fake-indexeddb)
- [x] Playwright E2E (chromium, mockowane API)
- [x] PWA: manifest + service worker registration + precache (19 entries, 1112 KiB)

**Coverage:**
- 86.63% lines / 90.32% functions / 79.11% branches
- **75 testów jednostkowych zielonych**
- typecheck: 0 errors, lint: 0 warnings

DoD:
- [x] Vite dev server (`npm run dev`)
- [x] `npm run build` bez błędów
- [x] TypeScript strict, zero `any`, zero `tsc` errors
- [x] Vitest coverage ≥ 80%
- [x] MapLibre ładuje PMTiles z `/api/v1/pmtiles/dzialki`
- [x] Klik na mapę → API → popup
- [x] PWA: manifest + service worker
- [x] Dockerfile multi-stage
- [x] Playwright E2E przechodzi
- [x] README w `apps/web/README.md`

**Znalezione problemy / uwagi dla innych agentów:**

1. **Branch confusion:** początkowo commity trafiły na `feat/backend-scaffold` (system przeniósł HEAD). Naprawione w trakcie (`git branch -f feat/frontend-scaffold HEAD`). Backend branch przywrócony do właściwego stanu przed ostatecznym commitem.

2. **TODO dla follow-up (nie w MVP scaffold):**
   - FAB dodawania drzewa z GPS i strzałkami 25cm (komponent)
   - Widok projektu z markerami drzew (kolor/wielkość)
   - Kreator PDF (jsPDF + html2canvas + kompas)
   - Prawdziwe PNG ikony PWA (obecnie: placeholder)
   - Backup/restore JSON

3. **MapLibre + Leaflet:** MapLibre wybrany zamiast Leaflet (lepsze wsparcie PMTiles / vector tiles). Leaflet wciąż w zależnościach jako fallback.

---

## ETL (subagent: etl)

Branch: `feat/etl-scaffold`

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

**Pinned wersje:** python 3.12, pytest 9.x, pydantic-settings, structlog, respx, hypothesis
**CLI exit codes:** 0 = sukces, 1 = wyjątek, 2 = częściowy sukces, 130 = Ctrl+C
**Coverage `__main__.py`:** 97% (58 stmts, 2 miss: linie niedostępne w argparse help flow)
**Wszystkie testy:** 143 zielone (132 istniejące + 11 nowych CLI)

DoD:
- [x] Każdy moduł ETL ma testy (132 przed CLI; 143 po CLI)
- [x] Atomicity: każdy etap pisze do `.tmp`, rename po sukcesie, restore z backupu przy błędzie
- [x] Rollback: `data/backups/{timestamp}/` zachowuje poprzednią wersję każdego artifactu
- [x] Retencja: starych backupów czyszczonych do `RETENTION__BACKUPS_KEEP=2`
- [x] CLI: argparse, brak dodatkowych zależności runtime
- [x] Dry-run: nie pisze plików, waliduje konfigurację
- [x] README: quickstart + troubleshooting (tippecanoe, timeout, disk space)
- [x] STATUS.md zaktualizowany

**Znalezione problemy / uwagi dla innych agentów:**

1. **`get_settings()` nie akceptuje kwargs** — CLI buduje `Settings(**overrides)` bezpośrednio (nie modyfikowałem sygnatury, żeby nie zmieniać kontraktu).
2. **`PipelineResult`:** `started_at`/`finished_at` to `datetime`, `success` to property (`not self.errors`), brak pola `elapsed_seconds` — liczone w runtime jako `finished - started`.
3. **Coverage:** `coverage.xml` musi być w root `.gitignore` (reguła `coverage/` łapie tylko katalogi).
4. **Atomicity jest implementowana w `_run_*` helperach** w `pipeline.py` — każdy etap ma wzorzec: `backup_existing()` → `ensure_dirs()` → właściwa praca → `rename(.tmp → final)`. Wyjątek w trakcie pracy triggeruje `_fail_with_partial()` który przywraca z backupu.
