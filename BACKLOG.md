# BACKLOG — wycinka.app

> **Aktualizowane przez nadzorcę.** Snapshot stanu projektu, znalezione problemy i kolejne kamienie milowe.
> Ostatnia aktualizacja: **2026-10-09 (wieczór)** — 4 gałęzie zmergowane (search-ui, rename-project, map-layer-perf, pdf-layout), CI partial-fix; snapshoty PNG posprzątane z repo.
>
> **Przeczytaj najpierw:** `README.md` → `AGENTS.md` → `PLAN.md` → `coordination/STATUS.md`.

---

## 1. Stan projektu (2026-10-09 wieczór)

### Co jest zmergowane do `main` (dzisiaj, 2026-10-09)

| Merge | Branch | Co dostarczone | Wyniki |
|---|---|---|---|
| `8cd0f41` | `feat/rename-project` | Rename projektu (dialog ✏️ na /projects, walidacja zod 1–100 znaków, toast PL), „Nowy projekt" z polem nazwy, fixture `minimal.pmtiles` zcommitowany (`-f`) | unit 437/437, coverage 93%, e2e 26/26 |
| `f216740` | `feat/search-ui` | **SearchBox TERYT** w Headerze (debounce 500 ms, min 2 znaki, max 10 wyników, keyboard/ESC, badge „w projekcie", flyTo na centroid), healthcheck PMTiles HEAD→GET (`Range: bytes=0-0`, fix 405) | unit 436/436, coverage 92.9%, e2e 30/30 |
| `72be05e` | `fix/map-layer-perf` | **Perf mapy**: styl do `mapStyle.ts`, `dzialki-outline` minzoom **15** (~500 m skali), `dzialki-fill` minzoom **17** (niżej tylko obrys — koniec „zielonego pola"); highlight/parcels bez kapu | unit 430/430, e2e 30/31 (1 pre-existing flake) |
| `9da58db` | `fix/pdf-layout` | **PDF naprawiony**: projekcja w km z korektą cos(lat) (był rozjazd E–W ~1,55×), paginacja tabel (limit 275 mm, „cd."), kompas bez odbicia lustrzanego, clamp markerów, **podgląd SVG str. 1 w dialogu** | unit 444/444, coverage 92.8% |

**Po integracji na main:** typecheck ✓, lint ✓, **unit 475/475 (48 plików)** ✓, build ✓, e2e 34/37 (3 fails — patrz §2.2)

### Deployment srv01 (stan z popołudnia — przed dzisiejszym merge)

- `https://wycinka.app` działa: basic auth (`wycinka`/`wycinka-demo-2026`), TLS, tunel, PMTiles Range 206 (magic `PMTiles`), EGiB powiat otwocki (178 099 działek, GPKG `1417.gpkg.zip` z opendata.geoportal.gov.pl — kanał fallback po outage WFS GUGiK)
- **Kontener web ma STARY build** (przed dzisiejszymi merge'ami) — **wymaga redeploy** patrz §3 "Najbliższe kroki"
- Zweryfikowane live: `/api/v1/parcel` 200/found (Józefów), `/api/v1/search` 10 hits, klik w działkę → request + karta (happy-path z fitBounds)

### Workflow pracy (sprawdzony)

1. Branch: `feat/<modul>-<cecha>` (od `main`)
2. Subagent pracuje **wyłącznie** w swoim katalogu (per AGENTS.md §3)
3. Commit atomowy, Conventional Commits
4. Supervisor: review → fix bugs → merge do main `--no-ff` → delete branch

---

## 2. Znalezione problemy (do adresu)

### ✅ Resolwione (dla historii)

| # | Problem | Rozwiązanie |
|---|---|---|
| — | **Tree-layer nie renderował się** — filter `['!', ['get','pending']]` w maplibre-gl 4.7.1 ewaluuje `!` na *brakującej* właściwości jako `false`, więc zapisane drzewa w ogóle się nie rysowały | Zmieniono na `['!=', ['get','pending'], true]` (`MapView.tsx`). Wykryte przez E2E marker-click. |
| 4 | **TreeListPanel** brak | Dostarczony (`TreeListPanel.tsx` + toggle button + store state) |
| 5 | **Popup markera** brak | Dostarczony (`TreePopup.tsx` w maplibre Popup, Edytuj/Usuń) |

### 🔴 Wysoki priorytet

| # | Problem | Gdzie | Co zrobić |
|---|---|---|---|
| A | **CI czerwone na main (2 z 3 przyczyn naprawione, commit `7cd7380`)** — (1) job Infra: `pip install pyyaml` (fix w workflow, czeka na push/run), (2) job E2E: fixture `minimal.pmtiles` brakował → **zcommitowany** przez rename (129 B), (3) ~~E2E~~ — patrz #B | `.github/workflows/ci.yml` | Push main → sprawdzić run → jak E2E dalej czerwony, wyłączyć… patrz #B |
| B | **E2E `snap-vertex.spec.ts:149` pada DETERMINISTYCZNIE także na bazowym `297bb5b`** (sprawdzone worktree /root/wt-base po restore) — **pre-existing, nie regresja z merge'y**. Diagnoza na dziś: `usePendingDrag` startuje drag tylko na `map.on('mousedown','trees-pending-circle')`, a `queryRenderedFeatures` na pozycji pinezki zwraca **pusto** mimo panelu otwartego (drzewo pending widać w panelu "Pozycja 52.22970…"). Debug spec (dbg-snap) pokazał `trees-pending-circle` bez hit-testów. Podejrzenia: (a) warstwa GeoJSON pending nie ma features w momencie kliku (timing efektu setData vs `styleLoaded`), (b) mapa remountuje się i `wycinkaMap` pokazuje stary obiekt, (c) warstwa nie-queryable. **Nie deployować z tym testem w CI bez vurify** | `apps/web/tests/e2e/snap-vertex.spec.ts`, `src/components/map/usePendingDrag.ts` | Agent debug (frontend): confirm whether treeLayer `setData` runs; ewentualnie test przełączony na drag przez maplibre Marker bez query; baseline 297bb5b dobrze działa ręcznie? |
| C | **Multi-parcel E2E kosztowny lottery** — `multi-parcel.spec.ts:120` "add two parcels" wymagał klikania po mapie + PDF dialog scroll overflow; **dialog naprawiony** (commit `7cd7380`: `max-h-[85vh]` + scroll body), test znów green. Został flake „remove button" | `apps/web/src/components/pdf/PdfExportDialog.tsx` | Po push — observe CI 2–3 runs |
| D | **E2E `settings` backup roundtrip** flaky (padł w pełnym run, green w pojedynczym) — podejrzenie zależność IndexedDB między specami (deleteDatabase) | `apps/web/tests/e2e/settings.spec.ts:132` | Izolacja: kontekst per test / storageState |
| E | **srv01 nie ma dziś builda z multi-parcel + dzisiejszych fixów** — live demo użytkownika może mylić (karta po kliku działa w happy-path, ale agregat/searchbox/perf nie) | srv01 `/opt/wycinka` | Redeploy z nowego main (patrz §3) |

### 🟡 Średni priorytet (UX / jakość)

| # | Problem | Gdzie | Co zrobić |
|---|---|---|---|
| F | **Rename projektu / create dialog — „Mój pierwszy projekt" default** — działa, przetestowane; TODO: poprawić copy na nie-mobilnych (margin dialogu) | `apps/web/src/pages/ProjectsPage.tsx` | Poler przy okazji |
| G | **SearchBox — brak debounce-owej request canceli między komponentami** (ok w SearchBox przez request-id guard); wynik click przechodzi przez `GET /api/v1/parcel/{teryt}` — **backend obsługuje tylko point-query** (workaround: teryt → szukamy przez aggregate /☐?) — działa bo backend ma `/parcel?teryt=` param? **TODO vurify** — jak backend nie ma by-teryt endpoint, search-nav uç E2E karena mock bypass — pokryć na live | `apps/web/src/lib/search.ts`, `apps/api/app/routes/parcel.py` | Sprawdzić 404 response real backend, w razie czego endpoint by-teryt |
| H | **Prawdziwe PNG ikony PWA** — nadal SVG placeholdery (192×192, 512×512) | `apps/web/public/icons/` | Designer/agent UI: wyeksportować PNG (sharp) |
| I | **MapView/TreeMarkers coverage gap** — vitest mockuje maplibre-gl (~49%/28%); mapStyle.ts pokryty 100% (wydzielony przez map-perf) | `apps/web/src/components/map/` | Zostawić (E2E pokrywa) |
| J | **Hold-to-repeat w ArrowPad** nie testowany E2E | `apps/web/src/components/trees/ArrowPad.tsx` | Playwright: hold → 5 strzałów → offset |
| K | **GPS averaging** — PLAN §6.2 (mediana z N) — bufor działa dla 5 sample przy placing, brakuje w idle GPS pipe | `apps/web/src/hooks/useGeolocation.ts` | Opcja `averagingSamples` |

### 🟢 Niski priorytet (nice-to-have)

| # | Problem | Gdzie | Co zrobić |
|---|---|---|---|
| L | **Snapshot rendering mapy (PMTiles compare)** — brak wizualnych regression testów | `tests/` | Playwright screenshot diff na mockowanym tile (opcja) |
| M | **E2E multi-parcel — agent zaleca migrację na drag-mapę (nie click fixed coords)** | `apps/web/tests/e2e/multi-parcel.spec.ts` | Refactor testu po puszczeniu #B |

---

## 3. Milestony — status

### ✅ Milestone 4 — TreeListPanel + marker popup (DOSTARCZONE)
### ✅ Milestone 5 — Kreator PDF (DOSTARCZONE 2026-10-09; **rozszerzone fix/pdf-layout**: km-projekcja, paginacja, kompas, podgląd SVG)
### ✅ Milestone 6 — Per-project configuration UI (DOSTARCZONE)
### ✅ Milestone 7 — Backup/restore JSON (DOSTARCZONE)
### ✅ Milestone 8 — Backend polish (DOSTARCZONE)
### ✅ Milestone 9 — Infra ETL cron + runbook (DOSTARCZONE)
### ✅ Milestone 10 — Real EGiB data (DOSTARCZONE — GPKG powiat otwocki, opendata fallback)
### ✅ Dodatkowe (2026-10-09): multi-parcel, mobile bottom-sheet, GPS averaging, snap-to-vertex, fitBounds, SearchBox TERYT, rename projektu, map layer perf, PDF fix

### Pozostały kamień milowy — Deployment & stabilizacja live (SRV01) ← DALEJ
- **Estymata:** 2-4h
- **Scope:** redeploy web+api z main `bf4a72e` (multi-parcel, searchbox, perf, PDF fix), zielone CI (`7cd7380` fix + push), ręczny happy-path na prodzkim URL, obserwacja CI 2-3 runs pod kątem flake (#B, #C, #D)
- **Agent:** nadzorca (+ infra ewentualnie)
- **Kroki:** (1) push main; (2) sprawdź CI; (3) ssh srv01 → `git pull && docker compose build web api && docker compose up -d`; (4) clearBrowserCache + rceed happy-path: klik działka → ➕ do projektu → chipsy → PDF; (5) searchbox TERYT na live działa (backend `/parcel?teryt` vurify)

---

## 4. Decyzje do podjęcia (przez nadzorcę)

| Decyzja | Status | Uwagi |
|---|---|---|
| Map provider (PMTiles vs Leaflet) | ✅ PMTiles | PLAN §2 |
| Backend self-hosted | ✅ FastAPI | PLAN §11 |
| Domain | ✅ `wycinka.app` | Live, Cloudflare Tunnel |
| Cloudflare Tunnel | ✅ Live na srv01 | Token `/root/.cloudflared-wycinka.token`, zone `wycinka.app` |
| Production server | ✅ srv01 (192.168.10.212) | Docker 29 + Compose v2.39, `/opt/wycinka`, volumes `wycinka_api-data` |
| Auth | ✅ Basic auth Caddy | user `wycinka`, hash w `/opt/wycinka/infra/.env` |
| **Snap-to-vertex na desktopie** | ❓ Do przemyślenia | Panel „Dodaj drzewo" na desktopie = sidebar 22rem top-right (niechapuje mapy), a jednak E2E drag nie działa — bug w$query; czy drag pinezki desktop w ogóle jest w UX PLAN? Patrz #B |
| **Publiczny rollout** | 🔄 Odroczony | Do endy po stabilizacji srv01; samo wystawienie Cloudflare gotowe |

---

## 5. Środowisko deweloperskie (stan 2026-10-09 / Linux srv)

### Git worktrees (sprawdzony workflow)

- Subagenci: `git worktree add ../wt-<modul> -b feat/<modul>` — każdy agent ma swój katalog, zero konfliktów. Dzisiaj 4 agentów równolegle na worktree — **bez jednego konfliktu kodowego** (jedyny konflikt: `coordination/STATUS.md`, ręcznie scalony przez nadzorcę).
- Po merge: `git worktree remove ../wt-<modul> --force` + `git branch -d <branch>`. **Zostają stare worktree** `/root/wt-backend-fix`, `/root/wt-frontend-main`, `/root/wt-infra-auth` (stare sprawy, do weryfikacji/jeszcze przydatne? iwypo — do opróżnienia).
- **Przypadkowe reformatowanie**: agent uruchomił `prettier --write` na całości — sięgnęło 60+ plików (głównie whitespace). Cofnięte z merge'a przez `--ignore-all-space` weryfikację. **Reguła dla agentów: nie formatuj plików poza swoim scope.**

### Playwright (E2E) znane cechy

- **Fixture `tests/e2e/fixtures/minimal.pmtiles`** — ZIP gitignored (`*.pmtiles`); **zcommitowany z `-f`** (129 B syntetyczne v3). Jak zaginie: wygenerować albo pobrać `test_fixture_1.pmtiles` z protomaps/PMTiles `js/test/data` (468 B; pewny — snap waliduje).
- **npm run test:e2e** wymaga `--config tests/e2e/playwright.config.ts` (baseURL 5173). Runtime na 5173; `E2E_PORT` env **nie działa** (hardcode PORT w config) — patrz problem kiedy uruchamiamy ręcznie bez skryptu (`npx playwright test tests/e2e/foo.spec.ts` bez `--config` → „Cannot navigate to invalid URL" dla relative goto).
- **Flaky E2E**: `snap-vertex.spec.ts:149` (deterministycznie padający, pre-existing patrz #B), `settings.spec.ts:132` (backup roundtrip, flaky #D), `multi-parcel` „remove button" (flaky #C). Retries=1 maskuje częściowo.
- **Desktop viewport 1280×720** — AddTreePanel = sidebar 22rem top-right (nie hamparza mapy po lewej). Mobile: bottom-sheet (drag close).

---

## 6. Komendy przydatne

```powershell
# Setup (po sklonowaniu)
cd "C:\Users\mateusz.przybyl\OneDrive - Polska Agencja Żeglugi Powietrznej\Dokumenty\OpenCode\wycinkaApp"

# Frontend
cd apps/web
npm install
npm test                    # 212 unit
npm run test:coverage       # coverage (OneDrive może rzucić EPERM — zignoruj)
npm run test:e2e            # Playwright
npm run typecheck
npm run lint
npm run build               # PWA build → dist/

# Backend
cd ../api
pip install -e ".[dev]"
pytest                      # 55 testów
pytest --cov                # 86% globalnie

# Infra
cd ../infra
python tests/run.py         # 31 walidacji (compose/caddy/cloudflared)
docker compose config       # (wymaga docker)

# ETL
cd ../scripts/sync-egib
pip install -e ".[dev]"
pytest                      # 143 testów
python -m egib_sync --help  # CLI
```

---

## 7. Powiązane pliki

- `PLAN.md` — plan projektu, 11 sekcji, źródło prawdy architektury
- `AGENTS.md` — instrukcje dla subagentów
- `coordination/STATUS.md` — aktualny status wszystkich modułów + TODO listy per moduł
- `coordination/REQUESTS.md` — historia pytań między agentami (wszystkie ANSWERED)
- `docs/api-contract.md` — NIEZMIENNIALNY kontrakt API
- `docs/data-schema.md` — schemat SQLite/PMTiles z R-tree map pattern

---

**Kolejny krok:** Milestone 7 (Backup/restore JSON) → Milestone 6 (Per-project config UI) → Milestone 10 (Real EGiB data). Następnie przegląd issues Wysokiego priorytetu (#4 rtree_delete orphan, #6 CORS).