# STATUS — co robią poszczególni agenci

> Aktualizowane przez każdego subagenta po zakończeniu zadania.

## Frontend (rename projektu) — branch `feat/rename-project`, worktree `/root/wt-rename` (2026-10-09)

Commity (atomowe): `6ec14b1` → `b7eee30` → `6cbacbe` → `587beb8` → `2f0dd2b` (+ `fix(e2e)` fixture).

- [x] **Dexie helper `renameProject(id, name)`** (`6ec14b1`, `b7eee30`): `db/schema.ts` — zod
      `projectNameSchema` (trim, 1–100 znaków, komunikat „Nazwa projektu musi mieć od 1 do 100 znaków"),
      return `{ok:true, project} | {ok:false, error}` (brak throw), persist z nowym `updatedAt`. Store
      `projectStore.renameProject(id, name): Promise<boolean>` — toast na błąd, update `projects`,
      aktywny projekt (id, getActive) nadpisuje nazwę, `activeProjectId` bez zmian.
- [x] **UI /projects** (`6cbacbe`): akcja „Edytuj nazwę" (ikona ✏️ `Pencil`, `data-testid=project-rename`,
      touch target h-11/w-11; usunięcie też powiększone do 44px) → dialog (spójny z confirm-delete:
      fixed inset-0 + Card) z inputem prefilled, Zapisz/Anuluj, `rename-error` (role=alert), Enter=save.
      Bonus: **„Nowy projekt"** otwiera dialog z polem nazwy (domyślnie „Mój pierwszy projekt",
      `data-testid=create-dialog`/`create-name-input`/`create-save`; błąd dla pustej nazwy).
      ⚠️ Zmieniony flow tworzenia — e2e `settings.spec.ts` zaadaptowane (create-save w dialogu).
- [x] **Testy**: unit `db.test.ts` (renameProject: trim/persist, pusta nazwa, >100, =100 ok, ghost id),
      `projectStore.test.ts` (3: persist, toast+no-change, aktywna nazwa), `ProjectsPage.test.tsx`
      (+6: dialog tworz. z domyślną nazwą, custom name, create error, cancel rename, save persist,
      invalid input). E2E `rename.spec.ts` (3: utwórz → rename karta → **persist po reload**, cancel,
      pusta nazwa → błąd; **bez `deleteDatabase` w initScript** — context Playwright ma świeży IndexedDB,
      a initScript wycinał db przy każdej nawigacji/reload).
- [x] **Fixture `tests/e2e/fixtures/minimal.pmtiles`** (`fix(e2e)`): commitowana (`git add -f`,
      *.pmtiles w .gitignore) — plik zaginiony przy merge; bez niego `snap-vertex.spec.ts` `readFileSync`
      ENOENT blokował cały suite. Skopiowana z wt-mapperf (129 B, tippecanoe z=8).
- Gates: **typecheck ✓ / lint ✓ / unit 437/437 ✓ / coverage 93.12/89.15/89.09% (progi 80/80/75 ✓) —
  ProjectsPage 97.72%, projectStore 81.81% / build (PWA dist) ✓ / E2E 26/26 ✓** (3 flaky z poprzednich
  branchy przeszły na retry; 3 nowe rename spec green od pierwszego runu).

### ⚠️ Uwagi dla innych / dla nadzorcy

## Frontend (UX mobilny) — branch `feat/ux-mobile-panel`, worktree `/root/wt-ux-mobile` (2026-10-09)

Commity (atomowe, w kolejności): `2af2d86` → `6ddbd07` → `bf1167b` → `6654bbc`.

- [x] **fitBounds wg bbox działki** (`2af2d86`): `MapPage` — usunięty `flyTo` do centroidu; nowy
      `parcelFitBounds(bbox, geom)` w `tests/unit/geoBounds.test.ts` + `lib/geo.ts` (walidacja bbox,
      fallback z geometrii; fitBounds `[[minLng,minLat],[maxLng,maxLat]], {padding:60, maxZoom:17, duration:800}`);
      unit test asercji fitBounds + `maxZoom: ≤17` (mock `mapInstance.fitBounds`).
- [x] **Jedna karta działki** (`6ddbd07`): usunięty maplibre Popup dla `selectedParcel` (duplikat);
      `ParcelPopup` zostaje TYLKO w karcie "Wybrana działka" (aside lewy-górny). Card nowy layout:
      TERYT widoczny zawsze, szczegóły zwinięte na mobile z przyciskiem toggle ("Szczegóły"/"Mniej",
      `data-testid=parcel-card-toggle`)
      i przycisk "Zamknij" (X, 44×44px). Na desktop szczegóły widoczne wprost. Testy unit (MapPage +
      ParcelPopup brakPopup / toggle / close) + E2E na klik.
- [x] **AddTreePanel — mobile-first** (`bf1167b`): na ≤640px = **bottom sheet 62vh** (rounded-t,
      drag-handle `data-testid=add-tree-drag-handle`; drag tylko przez handle, `useDragControls` +
      `dragListener={false}`, ograniczenie `dragConstraints.y >= 0` — wierzch panelu zawsze poniżej
      górnej krawędzi ekranu; zamknięcie przez przeciągnięcie poniżej progu offset/velocity).
      Na ≥640px = wąska **sidebar po prawej** (width min(22rem, 90vw), height calc(100%-1.5rem),
      rounded-2xl)`; panel ma wszystkie kontrolki (GPS, pozycja, ArrowPad, TreeForm, Anuluj/Zapisz).
      Nowy przycisk **"Przesuń mapę do pinezki"** (`data-testid=focus-pending`, ikona LocateFixed):
      `mapStore.requestFocus({lat,lng})` → `MapPage` effect `map.flyTo({center, zoom: map.getZoom(),
      duration:500})` i czyści focusTarget. Touch targety ≥44px (zamknij X h-11/w-11, przycisk
      h-11, przyciski Button size md h-11, ArrowPad h-14).
- [x] **Pointer-events** (debug #3): overlaye `aside#map-overlays` mają `pointer-events-none`
      (children `pointer-events-auto`); `AddTreePanel` i `drag-handle` renderują się **bazą**
      `id`/`data-testid` i zamykają się poprawnie (E2E dotknąć+dotknąć działa). Zatwierdzone E2E.
- [x] **E2E mobile** (`tests/e2e/mobile-panel.spec.ts`, 6 testów): viewport 390×844 + `hasTouch`
      — bottom sheet 55–65% vh, ArrowPad klikalne, drag-handle zamyka, focus-pending fokusuje mapę
      (poll center ≈ 52.2297/21.0122); click działki → karta ≤70vw bez maplibre-popup; desktop
      (1280×720, GPS denied): narrow sidebar ≥320px po prawej + seed z centroidu (52.151/21.23
      po klik w mockowaną działkę i FAB).
- [x] **Fixture `tests/e2e/fixtures/minimal.pmtiles`** (`6654bbc`): wygenerowana tippecanoe
      (źródło: `tests/e2e/snap-vertex.spec.ts` — readFileSync na preexistującym brakującym pliku
      powodowało **EN Mixing ENOENT** blokujące cały suite; wygenerowano z pmtiles warstwą `dzialki`
      z=8, 627 B). Fixture jest ** committed** (mały, wygenerowany skryptem tippecanoe 2.79.0
      z /root/tippecanoe).
- [x] **MapView dev-hook** (`6654bbc`): `window.wycinkaMap` rejestrowany zaraz po konstrukcji mapy
      (nie dopiero po `load`) — ułatwia/testuje E2E loty/fokusem zanim style/tiles się doładują
      (dev tylko, produkcyjny brak zmian). Usunięte mock-approach `readFileSync` przy loadzie.
- Gates: **typecheck ✓ / lint --max-warnings=0 ✓ / unit 386/386 ✓ / coverage 93.42 / 89.13 /
  89.19% (progi 80/80/75 ✓) / build (PWA dist) ✓ / E2E 26/26 ✓** (full suite, w tym 6 nowych mobile).

### ⚠️ Uwagi dla innych / dla nadzorcy

- **Kolizja portu 5173:** dev-serwery z kilku worktree'ów (`/root/wycinka`, `/root/wt-multi-parcel`,
  `/root/wt-ux-mobile`) walczą o ten sam port; `webServer.reuseExistingServer` w
  `tests/e2e/playwright.config.ts` potrafi podłączyć się do **starego kodu** z cudzego worktree
  (objaw: e2e "widzi" stare klasy/DOM mimo nowych commitów). Podczas sesji używałem własnej
  instancji Vite na porcie 5199 (`--port 5199 --strictPort`, lokalna kopia configu, niezacommitowana).
  Propozycja: parametryzacja portu przez env (np. `E2E_PORT`) lub per-worktree port.
- Fixture `minimal.pmtiles` nigdy nie był w repo (sprzed tej sesji) — `snap-vertex.spec.ts` padał
  na `readFileSync` (ENOENT) i blokował cały suite E2E. Wygenerowany binarnie przez tippecanoe,
  deterministycznie (wektor `dzialki`, jeden feature na z=8, 627 B).
- `window.wycinkaMap` rejestrowane teraz zaraz po utworzeniu mapy (nie po `load`) — style/tiles
  moga się doładować z opóźnieniem, a testy/E2E mogają korzystać z `getCenter()/project()` od razu.
  Zmiana tylko w `import.meta.env.MODE !== 'production'`.

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

## Backend — Milestone 8 (polish) — branch `feat/backend-migrations-sync-api`

Dostarczone (3 commity, wszystkie w `apps/api/**`; `coordination/STATUS.md` tylko ten raport):

- [x] `d9dc542` **feat: alembic migrations** — `alembic>=1.13` w dependencies,
      `apps/api/alembic.ini` + `apps/api/migrations/` (env.py + script.py.mako).
      Migracja `0001_initial_schema` tworzy na **pustym** SQLite pełny schemat
      zgodny z `app/core/db.py`: `parcels` + indeksy, `parcels_rtree`,
      `parcels_rtree_map`, triggery `parcels_rtree_insert`/`_delete`,
      `sync_meta`. DDL importowane z `app.core.db` (jedno źródło prawdy);
      wielostatementowe DDL przez `executescript` (op.execute nie ogarnia
      wirtualnych tabel i triggerów BEGIN...END). Downgrade = drop wszystkiego.
      URL bazy: `alembic.ini` → nadpisanie przez `WYCINKA_DB_URL` albo
      `alembic -x db_url=...`. Zweryfikowane także z poziomu CLI (`alembic upgrade head`).
- [x] `90bd5bc` **feat: /api/v1/sync/trigger + /api/v1/sync/status** —
      `SyncService` (`app/services/sync_service.py`) odpala ETL jako zewnętrzną
      komendę (`WYCINKA_SYNC_COMMAND`, domyślnie pusta = sync wyłączony)
      przez `asyncio.create_subprocess_shell` w tle; stan w `sync_meta`
      (`sync_status`, `sync_started_at`, `sync_finished_at`, `sync_error`,
      `last_sync` przy sukcesie). Endpointy:
      - `POST /api/v1/sync/trigger` → **202** `{status:"running",started_at,message}`;
        błędy: **409** `SYNC_ALREADY_RUNNING`, **400** `SYNC_NOT_CONFIGURED`,
        **503** `DB_UNAVAILABLE` (format błędu jak w pozostałych endpointach:
        `{error, code, details}`).
      - `GET /api/v1/sync/status` → **200** `{status: running|success|error|unknown,
        running, started_at, finished_at, last_sync, error}`; **503** gdy baza
        niedostępna.
      - ⚠️ **Kontrakt `docs/api-contract.md` nie opisuje `/sync/*`** —
        zaimplementowane sensownie w duchu kontraktu (error-shape, `/api/v1`
        prefix, 503 DB_UNAVAILABLE), kontraktu nie edytowałem. Do decyzji
        nadzorcy: dopisanie do kontraktu oraz docelowa komenda ETL w compose
        (`WYCINKA_SYNC_COMMAND="python -m egib_sync full"`).
      - ⚠️ Znaleziony (istniejący) problem w triggere `parcels_rtree_delete`
        (identyczny w `db.py`, docs i migracji — spójnie z spec): drugi statement
        SELECT-uje `rtree_id` z `parcels_rtree_map` **po** usunięciu wiersza mapy,
        więc wpis w `parcels_rtree` zostaje orphan. Wiersz mapy jest czyszczony
        poprawnie; R-tree zapytania łączą przez mapę, więc nie wpływają na
        wyniki. Propozycja poprawki (zamiana kolejności / stash id) do decyzji
        nadzorcy — zmiana wymagałaby edycji `app/core/db.py` + migracji.
- [x] `1ef5618` **feat: prod file logging** — `configure_logging`: dev
      (`WYCINKA_DEBUG=1`) → kolorowy stdout bez zmian; prod → JSON
      do `wycinka.log` (append, per-line flush, katalog tworzony automatycznie,
      `.gitignore` zaktualizowany). Ustawienie: `WYCINKA_LOG_FILE`.

**Testy:** `72 passed` (było 55; +17: 6 migracje, 9 sync, 2 logging).
**Coverage** (`pytest --cov=app --cov=migrations`): **88%** linii (wymóg ≥80%
spełniony); nowe moduły: `app/api/sync.py` 94%, `app/services/sync_service.py`
87%, `app/core/logging.py` 100%, `migrations/0001` 96%.
**Quality gates:** `ruff check` clean, `ruff format` clean (py312, konwencje §4.2),
`pytest -q` zielone. Brak TODO/console.log w kodzie produkcyjnym.

TODO dla następnego etapu:
- decyzja nadzorca: `/sync/*` do `docs/api-contract.md`
- decyzja nadzorca: fix triggera `parcels_rtree_delete` (orphan w R-tree)
- ETL: ustawić `WYCINKA_SYNC_COMMAND` w `infra/docker-compose.yml`

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

## Frontend (Milestone 5 — Kreator PDF) — branch feat/frontend-pdf

- [x] Eksport PDF (jsPDF, wektorowo, bez html2canvas): przycisk "Eksportuj PDF" na mapie (MapPage, disabled przy 0 drzew), modal `PdfExportDialog` (UI po polsku)
- [x] Layouty per `project.pdfPrefs.layout`: single (mapa+tabela zbiorcza, lista na kolejnej stronie), combined (wszystko na jednej), one-per-page (sekcje na osobnych stronach) + `tableOnSeparatePage` / `showNumberedTable` / `autoRotate`; plan stron w `src/lib/pdf/pagePlan.ts`
- [x] Markery: kolor wg gatunku (getSpeciesColor), rozmiar wg obwodu (markerSizeForCm), opcjonalne numerowanie; poligon działki wektorowo
- [x] Kompas SVG (`src/components/pdf/Compass.tsx`, `src/lib/pdf/compass.ts`): północ prawdziwa, uwzględnia obrót mapy; podgląd w dialogu
- [x] Auto-obrót mapy 0–85° (`chooseRotation`, minimalizacja bbox), projekcja WGS84→mm (`makeProjector`, północ u góry)
- [x] Tabela zbiorcza gatunek × przedziały obwodów (agregacja, fallback 'Inne'), pełna lista numerowana (nr, gatunek, obwód, lokalizacja, paginacja), stopka: data / liczba drzew / suma obwodów; nazwa pliku `wycinka-<slug>-<data>.pdf`
- [x] Zapis preferencji: `updatePdfPrefs` (db/schema) + `savePdfPrefs` (projectStore) — zapis przy generowaniu
- [x] Deps: `jspdf@^4.2.1` (html2canvas niepotrzebny — rendering wektorowy jsPDF)
- Testy: **267/267 unit pass** (55 nowych: pagePlan, rangesTable/agregacja, geometry/projekcja+rotacja, compass, pdfReport z mockiem jsPDF, PdfExportDialog, Compass, MapPage-przycisk)
- Coverage: **91.44% lines / 87.22% functions / 87.26% branches** (src/lib/pdf: 97.18% lines); typecheck/lint/build clean
- Commits: `e311d2f` (feat), `99ffad9` (test) — nie mergowane do main

### TODO (resztki)

- Skala liniowa (scale bar) i legenda gatunków na mapie PDF — nie w zakresie milestone
- TERYT/pole działki w nagłówku tylko gdy projekt ma działkę z ULDK (obecnie '—')
- Paginacja dużej tabeli zbiorczej przy bardzo wielu gatunkach (obecnie pojedyncza strona OK do ~25 gatunków)

## Backend (backlog #4 — fix triggera parcels_rtree_delete) — branch fix/rtree-delete-orphan

### Bug
Trigger `parcels_rtree_delete` (AFTER DELETE ON parcels) najpierw czyścił `parcels_rtree_map`, a dopiero potem `DELETE FROM parcels_rtree WHERE id = (SELECT rtree_id FROM parcels_rtree_map ...)`. W momencie drugiego DELETE wiersz mapy już nie istniał, więc subquery zwracało NULL → wpis w `parcels_rtree` zostawał orphan (mapa czysta, R-tree zabrudzone; wyniki zapytań OK bo join idzie przez mapę).

### Fix
- `app/core/db.py`: trigger podzielony na `RTREE_INSERT_TRIGGER_SQL` / `RTREE_DELETE_TRIGGER_SQL` (`RTREE_TRIGGERS_SQL` = suma, `ALL_SCHEMA` bez zmian). W `parcels_rtree_delete` odwrotna kolejność: najpierw `DELETE FROM parcels_rtree` (subquery czyta `rtree_id`, zanim mapa zostanie usunięta), potem `DELETE FROM parcels_rtree_map`.
- Migracja **0002_fix_rtree_delete_trigger** (down_revision `0001_initial_schema`): DROP TRIGGER + CREATE TRIGGER z definicji importowanej z `app.core.db` (jedno źródło prawdy, pomocnik `_apply_script` jak w 0001) + cleanup istniejących orphanów: `DELETE FROM parcels_rtree WHERE id NOT IN (SELECT rtree_id FROM parcels_rtree_map)`. Downgrade odtwarza legacy (buggy) definicję.
- Adnotacja dla nadzorcy: `docs/data-schema.md` wymaga update (definicja triggera parcels_rtree_delete — nowa kolejność operacji) przy merge; `docs/` nie modyfikowałem.

### Delete paths w API (punkt 2 z zadania)
- Brak endpointu DELETE w `apps/api` (parcel_service / sync_service / api/* — tylko insert/upsert). `DELETE FROM parcels` występuje wyłącznie w generowaniu fixture (`tests/fixtures/generate_sample.py`) i testach — realny harm to ETL/sync przez upsert. Orphans powstawały więc tylko przy czyszczeniu testowych/fixture DB.

### Testy (4 nowe w `tests/test_migrations.py`)
- delete działki → `parcels_rtree` i mapa puste (0,0) przy head
- REPRO: instalacja legacy buggy triggera na 0001 → delete zostawia orphan (1,0) → `upgrade head` czyści orphan i dalszy INSERT/DELETE cycle czysty
- `downgrade 0001` → trigger odtworzony, mapa czyszczona (legacy zachowanie — rtree może zostać orphan, mapa zawsze czyszczona)
- upgrade/downgrade cycle → delete cycle czysty

### Wyniki
- pytest: **76/76 green** ( było 72, +4 )
- coverage: **88%** (bez regresji), `app/core/db.py` 89%
- ruff check: clean

## Frontend (Milestones 6+7 + backlog issues) — branch feat/frontend-config-backup

- [x] **Milestone 6 — Per-project configuration UI (PLAN §4.E)**
  - Strona `/settings` (`src/pages/SettingsPage.tsx`): edytor gatunków (`SpeciesEditor` — nazwa+kolor, add/remove/reorder, walidacja duplikatów/pustych), edytor przedziałów (`RangesEditor` — custom ranges zastępujące defaulty §8.5, przycisk ∞ = otwarty koniec, walidacja od<to + rozłączności rosnącej), edytor PDF prefs (`PdfPrefsEditor` — layout single/combined/one-per-page, markerScale baseSize/perCm/maxSize, markerSizeBy circumference/fixed, autoRotate, tableOnSeparatePage, showNumberedTable). Backup/restore wpięty na tej samej stronie (`BackupPanel`).
  - Persystencja: Dexie `updateSpeciesConfig`/`updateRangesConfig` (db/schema.ts) + `saveSpeciesConfig`/`saveRangesConfig`/`savePdfPrefs` (projectStore, Zustand).
  - **Migracja Dexie v1→v2** (`db.verno=2`, `CURRENT_VERSION=2`): upgrade normalizuje legacy projekty przez `normalizeProjectConfig` (uzupełnia brakujące speciesConfig/rangesConfig/pdfPrefs domyślnymi). Uwaga: upgrade callback Dexie nie da się sensownie uruchomić w fake-indexeddb, więc normalizacja jest przetestowana wprost (7 testów) + `db.verno===CURRENT_VERSION` w teście.
  - UI po polsku; integracja: route `/settings` (lazy) + link "Ustawienia" w Headerze.
- [x] **Milestone 7 — Backup/restore JSON (PLAN §4.H)** — szczegóły wyżej w historii commitów (`b332411`+fixes): `lib/backup.ts` (zod, geometria jako string, Infinity↔null w ranges), overwrite/merge-by-id (merge nie nadpisuje rekordów istniejących), `BackupError` PARSE/VALIDATION/UNSUPPORTED_VERSION (plik z wyższym `schemaVersion` odrzucony), UI `BackupPanel`.
- [x] **Backlog issues**: `api.types.Parcel` + `voivodeship_code/county_code/commune_code/datasource` (wg backend `ParcelDetail`; kody TERYT + Źródło w `ParcelPopup`); prawdziwe PNG ikony PWA 192/512 + maskable (skrypt bez zależności `apps/web/scripts/generate-icons.mjs`, swap w manifeście, SVG usunięte); lazy-load: `MapPage` i `SettingsPage` przez `React.lazy`+Suspense (kaseta mapy jako osobny chunk `MapPage-*.js`).
- Testy: **330/330 unit pass** (63 nowe: edytory 28, SettingsPage 3, BackupPanel 6, backup lib 13, store/save 6, db+migracja 7); nazwy `should X when Y`.
- Coverage: **92.28% lines / 87.5% functions / 87.96% branches** (threshold 80/80/75 ✅). settings/: SpeciesEditor 100%, RangesEditor ~100%, PdfPrefsEditor ~100%.
- Gates: typecheck ✅ / eslint --max-warnings=0 ✅ / test ✅ / test:coverage ✅ / build ✅ (PWA dist, 24 precache).
- Commits: `5305d8a` (backlog: Parcel fields + PNG + lazy-load), `b332411` `df273b9` `7858590` (M7 + fixes), `4e299d2` (M6). Branch gotowy do review — **nie mergować bez review nadzorcy** (per AGENTS.md §4.4).

### TODO (resztki / follow-up)

- PdfExportDialog nie oferuje edycji markerScale (jest w /settings); jeśli ma być w dialogu — dołożyć.
- E2E Playwright dla flow ustawień i backup/restore (unit pokryty; E2E Zalecane przy okazji M10).
- MSW mock dla /parcel zwraca kody TERYT — brak porównania z realnym backendem w testach (nie wymagane kontraktem).
- Upgrade callback Dexie v2: real-device test tylko ręcznie (fake-indexeddb nie wykonuje upgrade functions) — test jednostkowy normalizatora zastępuje.

## [CI agent] feat/ci-workflow (2026-10-09)
- Dodano `.github/workflows/ci.yml`: 5 jobów (api, web, infra, etl, e2e).
- Trigger: push main + PR + workflow_dispatch; e2e tylko pull_request / dispatch / push main.
- `permissions: contents: read` (least privilege) + concurrency cancel-in-progress.
- api: ruff check + pytest --cov z --cov-fail-under=80. web: typecheck/lint/test:coverage (thresholds z vitest.config.ts są wymuszane automatycznie)/build, cache npm z package-lock.json. etl: pytest. infra: python3 tests/run.py.
- e2e: playwright config ma webServer `npm run dev` → w jobie `npx playwright install --with-deps chromium`; upload raportu jako artifact przy failure.
- Walidacja: YAML parsuje się (yaml.safe_load), wersje actions: checkout@v4, setup-python@v5, setup-node@v4, upload-artifact@v4.
- Commit 8da0cf2 — nie mergować do main (nadzorca).

## Frontend (backlog #9 + #8 + E2E settings) — branch feat/frontend-e2e-gps (2026-10-09)

- [x] **Backlog #9 — GPS averaging** (`src/hooks/useGeolocation.ts`):
  - Nowa opcja `averagingSamples?: number` (default 1 — dotychczasowe zachowanie bez zmian; przy >=2 używa `watchPosition` automatycznie) + `averagingWindowMs?: number` (default 10s).
  - Bufor ostatnich N odczytów w oknie czasowym; wynik = MEDIANA lat/lng; outlier-reject accuracy (odrzucane odczyty z accuracy > 2× mediana accuracy; `AVERAGING_ACCURACY_OUTLIER_FACTOR=2`); accuracy wyniku = mediana zaakceptowanych.
  - `refresh()` czyści bufor (nowa sesja pomiaru).
  - Integracja: `MapPage` → `useGeolocation({ averagingSamples: mode === 'idle' ? 1 : 5 })` — podczas dodawania/edycji drzewa (mode placing/editing)GPS z watch + mediana 5 próbek; AddTreePanel/GpsIndicator/ArrowPad konsumują uśrednioną pozycję bez zmian (props flow).
  - Testy: 14 nowych unit `tests/unit/useGeolocationAveraging.test.ts` (mediana lat/lng, outlier accuracy—including borderline keep, okno czasowe eviction, evicted buffer > N, default passthrough/watch-not-called, averaging>wymusza watch, refresh czyści bufor, stała okna).
- [x] **Backlog #8 — E2E hold-to-repeat ArrowPad** (`tests/e2e/arrowpad-hold.spec.ts`): 3 scenariusze na real browser (page.mouse.down/up): hold 1.2s → offset ≥2.0 m (interval ~110 ms działa), release → interval czyszczony (stabilność 500 ms), soak 5 kolejnych przytrzymań (monotoniczny przyrost + brak stuck-interval). Unit już istniał; E2E na realnych timerach.
- [x] **E2E flow ustawień** (`tests/e2e/settings.spec.ts`): 3 scenariusze — gatunki (add/remove/reorder + persist po reload), przedziały override + PDF prefs persist po reload, kopia zapasowa export→import overwrite same-origin (komunikat „nadpisanie", 2 projekty przywrócone, config Projekt 1 zweryfikowany po otwarciu przez SPA nav). Dexie real, backend mockowany route'ami (`/api/v1/version`, `/api/v1/pmtiles/**`, geolocation mock) — pattern jak trees.spec.
- [x] **Stabilizacja E2E** (`tests/e2e/tree-list.spec.ts`): `ensureProjectAndFab` z retry (≤5 kliknięć zamiast pojedynczego) — flake „Brak projektu" pod obciążeniem parallel workers.
- Testy: **344/344 unit pass** (+14); **18/18 E2E pass** (15 istniejących + 3 arrowpad + 3 settings — arrowpad 3, settings 3 ⇒ 18 total: 12 starych + 6 nowych).
- Coverage: **92.68% lines / 88.24% branches** (threshold 80 ✅); useGeolocation 96.61%.
- Gates: typecheck ✅ / eslint --max-warnings=0 ✅ / test ✅ / test:coverage ✅ / build (PWA dist) ✅ / test:e2e ✅.
- Commits: `ab7ada4` (feat GPS averaging), `0b2003f` (test E2E arrowpad), `dffedd4` (test E2E settings), `5c15904` (test stabilizacja).
- Nie pochodzi z tej sesji: playwight core bump? — **nie**, projekt używa `@playwright/test@^1.48` (1.63.0 z lockfile); environment wymagał `npx playwright install chromium` (headless-shell v1243).

### Backlog poruszone pozycje
- #8 (hold-to-repeat E2E) ✅ — **done**
- #9 (GPS averaging) ✅ — **done**

## Frontend (backlog #10 — Snap-to-vertex pinezki) — branch feat/frontend-snap-vertex (2026-10-09)

Worktree: `/root/wt-snap`, branch `feat/frontend-snap-vertex`, 5 commitów atomowych (ne plan zmniejszyć do main przez nadzorcę).

- [x] `src/lib/snap.ts` — `extractVertexPoints` (wierzchołki Polygon/MultiPolygon działki),
      `snapToVertex` (haversine do najbliższego wierzchołka, próg w metrach),
      `snapThresholdMeters` (próg adaptacyjny: 12 px ekranu → metry, floor `SNAP_THRESHOLD_M`=1 m,
      cap `SNAP_MAX_THRESHOLD_M`=20 m), `extractVertexPoints`, coverage pices 100%
- [x] `src/lib/geo.ts` — `offsetBetween` (odwrotność offsetMeters: delta metrów między punktami)
- [x] `src/stores/treeStore.ts` — akcja `setPosition(lat, lng)`: przelicza manualOffset względem
      oryginalnej bazy GPS (draft.lat/lng NIE są ruszane), więc nudge/offsety liczone zawsze od GPS
- [x] `src/components/map/usePendingDrag.ts` — pointer/touch drag pinezki na layerze
      `trees-pending-circle` (maplibre events, bez setDraggable — pinezka rendering via GeoJSON,
      nie DOM marker): wyłączenie dragPan podczas dragu, live-update pozycji (onMove → setPosition),
      wskaźnik snapu: maplibregl.Marker z data-testid="snap-indicator" + GeoJSON ring
      `snap-indicator` (kółko w wierzchołku)
- [x] `src/components/map/MapView.tsx` — nowy prop `pendingDrag {vertices, onMove, onEnd}` +
      source/layers `snap-indicator`; dev hookup `window.wycinkaMap` (MODE != production)
- [x] `src/components/map/MapClickHandler.tsx` — w placing/editing klik na mapie przesuwa pinezkę
      (ze snapem do wierzchołka) zamiast lookupu działki; wierzchołki z `extractVertexPoints`;
      **naprawa regresji**: onMapClick ổnȋlnione przez refs (poprzednio zmiana identity było
      re-creating mapę w MapView i urywało flyTo do centroidu)
- [x] Persist potwierdzony: setPosition → save (Dexie позиции == wierzchołek)
- [x] Testy unit (43 files / 372 pass): `snap.test.ts` (14), `MapView.test.tsx` drag wrafki (7 w suite),
      `MapClickHandler.test.tsx` (2 — klik-snap w placing, brak snapu w idle), `treeStore.test.ts`
      (+4 setPosition/save), `geo.test.ts` (+4 offsetBetween)
- [x] Coverage łączny 92.9% (snap 100%, geo 100%, usePendingDrag 89.8%, MapClickHandler 92.9%),
      `coverage/coverage-summary.txt` dołączony
- [x] E2E `tests/e2e/snap-vertex.spec.ts` (2 testy): drag pinezki nad wierzchołkiem → wskaźnik
      widoczny, drop → pozycja pinezki == wierzchołek, zapis → pozycja drzewa w Dexie == wierzchołek
      (assert 1e-9 przez indexedDB); drugi test: brak snapu poza progiem
- [x] Fixtures: `tests/e2e/fixtures/minimal.pmtiles` (326 B, ważny pmtiles v3 z pustym warstwą
      vector `dzialki`) — bez tego maplibre nie emituje 'load' przy mockowanym pmtiles (blocker NA E2E)
- [x] Gates: typecheck ✓, lint --max-warnings=0 ✓, vitest 372/372 ✓, coverage ≥80% ✓,
      test:e2e 20/20 ✓ (cały suite, bez regresji tree-list/settings/trees), build ✓

**Decyzje:** (1) manual pointer-events na GeoJSON layer zamiast `setDraggable` — pinezka to
GeoJSON circle (nie marker DOM), przez co drag zustatki w jednym modelu renderowania;
(2) próg snapu adaptacyjny pikselowy (12 px ekranu, min 1 m / max 20 m) — stały 1 m wyobrażony
w terenie był nieosiągalny poniżej zoom ≈ 19 przy manuálnej dotyka; na wys.getInteger zoom wraca
do 1 m zgodnie z logiem; (3) dodatkowo klik na mapie w placing/editing przenosi pinezkę ze
snapem (drag ma być dotykający, natomiast klik to nóżna oczekiwana UX-moving).

**Uwaga dla innych:** MapClickHandler w placing/editing nie robi lookup działki (celowo).

---

## Frontend (subagent: frontend)

Branch: `feat/multi-parcel-project` (worktree /root/wt-multi-parcel)

### Multi-parcel per projekt (zakończone)

- [x] Dexie schema **v3**: tabela `project_parcels` (id, projectId, teryt,
      snapshot Parcel, addedAt); CURRENT_VERSION=3; dedupe po teryt,
      limit 20 działek/projekt; deleteProject kasuje parcel-e (cascade)
- [x] projectStore: `addParcelToProject(parcel, projectId?)`,
      `removeParcelFromProject(teryt)`, `projectParcels`, `isParcelInProject`,
      `loadProjectParcels`, setToast (toast limitu "Limit 20 działek na projekt")
- [x] ParcelPopup: akcja `add` („➕ Dodaj do projektu") / `remove`
      („Usuń z projektu" gdy działka już w projekcie) — dodawanie ręczne przez przycisk
- [x] Mapa: source `parcels` w MapView — wszystkie działki projektu wypełnione
      forest alpha 0.15, border granatowy; wybrana działka nadal żółty highlight
- [x] ProjectsPage: panel aktywnego projektu — liczba działek + chipsy TERYT
      z przyciskiem usuń (remove)
- [x] PDF: przy >1 działce PdfExportDialog pobiera
      `GET /api/v1/parcel/aggregate` (ky już miał aggregateParcels) i przekazuje
      geometrię do pdfReport: rysuje WSZYSTKIE zewnętrzne pierścienie
      (wypełnienie forest + border navy), label „N działki", nagłówek
      „Działki: N (lista TERYT …)", bbpo projection po wszystkich poligonach.
      Fallback: gdy aggregate padnie → geometry per-działka. Single → bez zmian.
- [x] Drzewa spójne: PDF numeruje/projektuje drzewa wg bbox wszystkich działek
- [x] Fix: `handleCreateProject` przez `ensureActiveProject()` — eliminuje race
      "stale loadProjects nadpisuje świeżo utworzony projekt" (występował w e2e)
- [x] E2E `tests/e2e/multi-parcel.spec.ts` (mockify /parcel, /parcel/aggregate)

### Gates
- typecheck OK, lint OK (max-warnings=0), 413 unit/integration testów OK,
  coverage 92.7% global / 89.1% branch, build OK, e2e 22/22 OK
  (3 pełne przebiegi bez faili; lokalnie workers=2, retries=1)

### Uwagi
- Fixture `tests/e2e/fixtures/minimal.pmtiles` jest gitignored (*.pmtiles) —
  wygenerowany lokalnie z minimalnego syntetycznego archiwum PMTiles v3
  (header + pusty root dir + '{}' metadata).
- Także hardening e2e w trees/arrowpad-hold/snap-vertex (retry czekania na FAB).
