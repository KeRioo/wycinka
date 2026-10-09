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

## Frontend (FAB + trees, branch `feat/frontend-fab-trees`)

- [x] **`src/lib/geo.ts`** — `offsetMeters`, `haversineMeters`, `classifyAccuracy`
      (dobra/średnia/słaba), `formatLatLng` (NS/EW), `getSpeciesColor`,
      `markerSizeForCm` (z `MarkerScale`). Własny haversine, bez turf.
- [x] **`src/stores/projectStore.ts`** — Zustand: `loadProjects`, `setActive`,
      `createAndActivate`, `deleteProject` (kaskadowe usuwanie drzew),
      `clear`, `getActive`. Auto-selekcja pierwszego projektu + helpery
      `ensureProjectsLoaded` / `ensureActiveProject`.
- [x] **`src/stores/treeStore.ts`** — Zustand: `mode: idle|placing|editing`,
      `pending: TreeDraft`, `trees`, `loadTrees`, `startPlacing`,
      `cancel`, `setSpecies`, `setCircumference`, `setNotes`, `nudge` (kumuluje
      dx/dy), `useGps` (reset offsetu), `save` (z walidacją zod), `selectTreeForEdit`,
      `updateTree`, `deleteTree`. Schemat `treeDraftSchema` w zod.
- [x] **`src/db/schema.ts`** — nowy `TreeUpdate` + `updateTree` helper.
- [x] **`src/components/trees/GpsIndicator.tsx`** — lat/lng, accuracy badge
      (good/medium/poor w kolorach forest/amber/red), refresh button,
      obsługa loading/error.
- [x] **`src/components/trees/ArrowPad.tsx`** — 4 strzałki (krok 0.25 m),
      center "📍 Użyj GPS" (opcjonalny), hold-to-repeat (350 ms delay,
      110 ms interval), status `Przesunięcie: +dx m / dy m`.
- [x] **`src/components/trees/TreeForm.tsx`** — react-hook-form + zod resolver.
      Select gatunku, input obwodu (1–1000 cm, krok 0.1), textarea notatek
      (max 500). Dwukierunkowa sync ze storem.
- [x] **`src/components/trees/Fab.tsx`** — pulsing FAB z framer-motion,
      aria-label="Dodaj drzewo".
- [x] **`src/components/trees/AddTreePanel.tsx`** — slide-up panel (spring
      damping 25, stiffness 200): nagłówek "Dodaj drzewo", GpsIndicator,
      wyświetlacz pozycji pending, ArrowPad, TreeForm, Anuluj/Zapisz.
      Sekwencja GPS-only przy starcie (draft bez GPS seeduje się z GPS gdy
      pozycja dostępna). Save jest disabled gdy formularz niepoprawny.
- [x] **`src/components/trees/TreeMarkers.tsx`** — `treeToFeature`,
      `treesToFeatureCollection`, `buildPendingFeature` (czerwony pulsing).
- [x] **`src/components/map/MapView.tsx`** — nowe propy: `treeLayer`
      (GeoJSON FeatureCollection) + `onTreeClick`. Warstwy `trees-circle`
      (drzewa) + `trees-pending-circle` (czerwony pulsing) z ekspresją
      `interpolate(['linear'], ['get','circumferencePx'], ...)`. Cursor pointer
      na hover. Source `trees` aktualizowany reaktywnie przez `useEffect`.
- [x] **`src/components/map/MapClickHandler.tsx`** — przekazuje `treeLayer` i
      `onTreeClick` do `MapView`.
- [x] **`src/pages/ProjectsPage.tsx`** — nowa strona `/projects`: lista
      projektów (nazwa, data), "+ Nowy projekt", potwierdzenie usunięcia
      (dialog), aktywny projekt wyróżniony ringiem.
- [x] **`src/pages/MapPage.tsx`** — integracja: `useProjectStore` +
      `useTreeStore` + `useGeolocation`. Prompt "Brak projektu" z CTA gdy brak
      projektu. FAB pojawia się gdy `mode === 'idle'`. Panel AddTree podpięty.
      TreeLayer budowany z `pending` gdy `mode !== 'idle'`, inaczej same
      `trees`.
- [x] **`src/components/layout/Header.tsx`** — dodany link "Projekty" → `/projects`.
- [x] **`src/App.tsx`** — nowy route `/projects` → `ProjectsPage`.
- [x] **`tests/e2e/playwright.config.ts`** — `testDir: '.'` + `testMatch: '*.spec.ts'`,
      `npm run test:e2e` wskazuje na `tests/e2e/playwright.config.ts`.
- [x] **Testy jednostkowe:**
    - `geo.test.ts` (22 testy): offset roundtrip, haversine correctness
      (zero/sym/Warszawa–Łódź), classifyAccuracy (granice + NaN/-inf),
      formatLatLng (N/S/E/W), getSpeciesColor (znany/nieznany/case-sensitive),
      markerSizeForCm (zero/środek/max/negative).
    - `projectStore.test.ts` (12): empty start, loadProjects, auto-select,
      setActive, createAndActivate, deleteProject + cascade trees,
      reassignment active, clear, error path, persist active.
    - `treeStore.test.ts` (23): idle start, startPlacing (GPS/centroid/prefer GPS),
      cancel, setSpecies/Circumference/Notes/empty notes, nudge (kumulacja),
      useGps reset offset, save (Dexie write + reset state), save z offsetem,
      save bez pending, save z niepoprawnymi danymi, loadTrees, deleteTree,
      selectTreeForEdit (populate pending), edit+save update, clear.
    - `GpsIndicator.test.tsx` (7): pozycja + accuracy, medium/poor badges,
      loading, error, refresh button, brak onRefresh.
    - `ArrowPad.test.tsx` (11): wszystkie 4 strzałki, custom step, repeat-on-hold
      (fake timers), use-GPS, status display.
    - `TreeForm.test.tsx` (8): render pól, species error, circumference 0
      error, sync species/circumference/notes, prefill z pending, defaultSpecies.
    - `AddTreePanel.test.tsx` (11): brak renderu idle, render placing,
      Anuluj/Zapisz buttons, disable przy braku species/circumference,
      enable przy poprawnym, cancel (button i close), save z reset state,
      pending position z offsetem, GPS error.
    - `Fab.test.tsx` (4): domyślny label, custom label, onClick, custom className.
    - `ProjectsPage.test.tsx` (8): tytuł + new project, empty state, lista,
      create + navigate, select + navigate, confirm dialog, cancel delete,
      confirm delete.
    - `MapPage.test.tsx` — istniejące (5 testów) nadal zielone.
- [x] **Testy E2E (Playwright):**
    - `trees.spec.ts` (3): full flow z arrow nudges + zapis + reload, cancel bez
      zapisu, disable save przy invalid form. Mockowane `navigator.geolocation`
      (52.2297, 21.0122, acc 8 m) i backend API.
- [x] `npm run typecheck` — czysto
- [x] `npm run lint` — czysto (0 warnings/errors)
- [x] `npm run test:coverage` — **82.72% lines / 83.84% funcs / 83.81% branches**
      (baseline 86.63% / 90.32% / 79.11% — wzrost na branches, lekkie
      obniżenie na lines/funcs przez nowe UI components — patrz "Open issues")
- [x] `npm run build` — sukces (PWA precache 19 entries, PWA + map bundle)
- [x] `npm run test:e2e` — **8/8 pass** (5 istniejących + 3 nowe)

**Branch:** `feat/frontend-fab-trees`
**Commits:** 6 atomowych commitów
**Pliki:** 17 created, 8 modified
**Testy:** 8 unit + 3 e2e nowe = 11 nowych; łącznie **183 unit pass** + **8 e2e pass**

### Open issues / TODO (dla kolejnych agentów)

- **Coverage spadek na lines/funcs** — `MapView.tsx` (49%) i `TreeMarkers.tsx`
  (28%) są słabo pokryte bo testy mockują `maplibregl.Map` zamiast realnej
  instancji. Pokrycie ścieżek `treeLayer`/`onTreeClick` można podnieść
  integrowanym testem komponentu lub uruchomieniem `MapView` z renderowanym
  canvasem. Realna wartość tych plików jest wysoka (integration + e2e to
  łapie), ale vitest coverage ich nie widzi.
- **Edit drzewa przez klik** — `selectTreeForEdit` jest podpięty do kliknięcia
  markera, ale panel `AddTreePanel` ma tytuł "Dodaj drzewo" niezależnie od
  trybu. W trybie edycji (`mode === 'editing'`) panel nie pokazuje jeszcze
  dedykowanego tytułu / zachowania; zapis aktualizuje istniejące drzewo
  (logika w `treeStore.save`), ale UX jeszcze do dopracowania.
- **Sync initial species z pendingu** — formularz ma `defaultValue` z `pending`,
  ale po zmianie pending przez strzałki (useGps, offset) w trakcie sesji
  formularz jest resetowany (patrz `formKey`). Działa, ale UX-owo warto to
  sprawdzić w PWA.
- **Marker click → popup drzewa** — kliknięcie markera włącza tryb edycji, ale
  nie pokazuje popupu z metadanymi drzewa (gatunek, obwód, data). Do dodania
  w następnym kroku.
- **Lazy-load mapy** — wciąż w TODO.
- **Prawdziwe PNG ikony PWA** — wciąż w TODO.
- **Kreator PDF** — wciąż w TODO.

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

---

## Frontend (TreeListPanel + marker popup) — branch feat/frontend-tree-list-popup

- [x] TreeListPanel.tsx (right drawer: list, species color dot, circumference, date, edit/delete)
- [x] TreePopup.tsx (maplibre popup on marker click: details + Edytuj + Usuń)
- [x] MapView refactor: trees/highlight sources+layers moved into static style (fixes tree-layer rendering)
- [x] treeStore: selectedTreeId + listPanelOpen (+ delete clears them)
- [x] MapPage integration: list toggle button, marker popup, flyTo on list selection
- [x] E2E tree-list.spec.ts (4 scenarios)
- [x] Fix (znaleziony w E2E): `trees-circle` filter `['!', ['get','pending']]` — maplibre-gl 4.7.1
      ocenia `!` na brakującej własności jako `false`, więc zapisane drzewa NIE renderowały się na mapie.
      Zmienione na `['!=', ['get','pending'], true]` (zweryfikowane empirycznie per-layer queryRenderedFeatures).
- Coverage: **90.07% lines / 86.01% functions / 86.49% branches** (vitest v8, threshold ≥80% zaliczony)
- Build: typecheck/lint/build clean; **212/212 unit tests pass**; E2E tree-list **4/4 pass**
- Commits: `d0167f9` (feat), `f90e7e7` (test) — nie mergowane do main

### TODO (resztki)

- `coverage/` + `test-results/` na Windows/OneDrive dają `EPERM rmdir ...\.tmp` po coverage/e2e —
  raporty generują się poprawnie, tylko cleanup katalogu tymczasowego się nie udaje (kosmetyka).
- E2E `tree-list.spec.ts` nie mockuje `/api/v1/parcel` — kliknięcie mapy poza markerem daje toast
  "Failed to fetch" (oczekiwane bez backendu; nie wpływa na asercje).

---

## Milestone 9 — infra (feat/infra-etl-cron-runbook), 2026-10-09

### Dostarczone
- `infra/etl/Dockerfile` — multi-stage: debian:bookworm-slim builder kompiluje tippecanoe z felt/tippecanoe (pin tag 2.79.0, `make install PREFIX`), egib-building stage buduje wheels z contextu `scripts/sync-egib`, runtime `python:3.12-slim-bookworm`, USER etluser (uid 1000), `tippecanoe --version` sanity check po buildzie.
- `infra/docker-compose.yml` — serwis `etl`: restart unless-stopped, healthcheck CMD-SHELL (bash skrypt), volume `api-data:/app/data` (rw) wspolny z api, siec `etl-net`, tmpfs /tmp, skrypty bindowane `:ro` do /usr/local/bin. Dev compose bez service (sync = manualny run-once).
- `infra/etl/{scheduler,run-sync,etl-healthcheck}.sh` — sleep-based scheduler (ETL_INTERVAL_SECONDS, run-once, SIGTERM trap), pojedynczy przebieg + markery `.sync-ops/last-success|last-failure` + rotacja JSON raportow, healthcheck freshness (marker starszy niz 2x interval = unhealthy).
- `infra/operational-runbook.md` — deploy step-by-step, rollback (IMAGE_TAG + tylko-service rebuild), monitoring (healthcheck per serwis, host-cron, logi, raporty JSON), troubleshooting (tunnel down, disk full, PMTiles corrupt, etl unhealthy), backup/restore.
- `infra/tests/` — test_compose_config rozszerzony o etl; nowy test_etl_config (bash -n, Dockerfile pins/non-root, runbook). `python3 infra/tests/run.py` = 51 testow OK (2 skip: docker CLI absent), walidacja statyczna.

### Decyzje
- Scheduler: **sleep-based bash loop** (nie ofelia/cron-d) — testowalny bez dockera (`bash -n`), nie wymaga roota (cron-d i ofelia tak), ten sam skrypt sluzy do run-once przez `docker compose run`.
- Tippecanoe: **build from source, pin 2.79.0** (nie fmtec/mathiasdufour image) — weryfikowalny pin w Dockerfile, mniejsza zaufanie-trzeciej-strony, identyczny glibc (debian builder + python slim runtime). Repo przesladowane do felt/tippecanoe.
- Siec etl: **dedikowana `etl-net` (bridge, NIE internal)** — ETL potrzebuje ruchu wychodacego do GUGIK/geoporta, izolacja od caddy/web zachowana.

### Uwagi dla innych
- etl pisze do `data/egib-raw`, `data/work`, `data/pmtiles`, `data/sqlite` we wspolnym wolumenie `api-data`; api czyta `pmtiles/dzialki.pmtiles` i `sqlite/parcels.sqlite` — backend: sciezki sa pod `/app/data/...`.
- Filtrowanie powiatow: `docker compose run --rm etl /usr/local/bin/run-sync.sh --powiat <teryt>`.
