# BACKLOG — wycinka.app

> **Aktualizowane przez nadzorcę.** Snapshot stanu projektu, znalezione problemy i kolejne kamienie milowe.
> Ostatnia aktualizacja: 2026-10-01 (po merge TreeListPanel + marker popup).
>
> **Przeczytaj najpierw:** `README.md` → `AGENTS.md` → `PLAN.md` → `coordination/STATUS.md`.

---

## 1. Stan projektu (2026-10-01)

### Co jest zmergowane do `main`

| Moduł | Co dostarczone | Coverage | Testy |
|---|---|---|---|
| **Backend** (`apps/api/`) | FastAPI + async aiosqlite + R-tree map pattern + WKT parser (hypothesis) + PMTiles Range/ETag/CORS | 86% | 55/55 ✓ |
| **Frontend** (`apps/web/`) | Vite+React+TS strict + ky + MapLibre PMTiles + Dexie + FAB + tree capture + TreeListPanel + marker popup + 17 gatunków PL | 90.1% | 212/212 ✓ |
| **Infra** (`infra/`) | docker-compose prod+dev, Caddy z PMTiles Range, nginx alt, cloudflared config, scripts | — | 31/33 (2 skipped — brak docker/caddy CLI) |
| **ETL** (`scripts/sync-egib/`) | Downloader+merger+pmtiles_gen+sqlite_loader+pipeline (atomicity/rollback)+CLI | 93.9% | 143/143 ✓ |
| **Docs** | `docs/api-contract.md` + `docs/data-schema.md` zsynchronizowane z implementacją (commit `2bebd98`) | — | — |

Commit **F** używany w `Origin:` URL: `https://github.com/KeRioo/wycinka.git`.

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
| 1 | **Frontend `Parcel` type** nie ma pól `voivodeship_code`, `county_code`, `commune_code`, `datasource` — backend je zwraca, frontend je ignoruje (extra fields allowed przez TS, ale UI ich nie pokazuje) | `apps/web/src/services/api.types.ts` | Dodać brakujące pola do interface `Parcel`, opcjonalnie wyświetlić w `ParcelPopup` |
| 2 | **ETL nie jest w docker-compose** — działa standalone albo jako cron. Brakuje definicji serwisu i zależności czasowych | `infra/docker-compose.yml` | Dodać serwis `etl` z `cron`, volume `api-data`, network `internal`. Rozważ `nominatim.org` rate-limit |
| 3 | **Caddy CORS** ustawiony na `Access-Control-Allow-Origin: *` — niebezpieczne w prod | `infra/caddy/Caddyfile` | Dodać env-driven origin (placeholder `<FRONTEND_ORIGIN>`), fallback w dev |

### 🟡 Średni priorytet (UX)

| # | Problem | Gdzie | Co zrobić |
|---|---|---|---|
| 6 | **Prawdziwe PNG ikony PWA** — są SVG placeholdery (192×192, 512×512) | `apps/web/public/icons/` | Designer/agent UI: wyeksportować PNG z figmy lub zamienić SVG → PNG (sharp, pngcrush) |

### 🟢 Niski priorytet (nice-to-have)

| # | Problem | Gdzie | Co zrobić |
|---|---|---|---|
| 7 | **MapView/TreeMarkers coverage gap** — vitest mockuje maplibre-gl, więc coverage ~49%/28% choć E2E pokrywa te ścieżki | `apps/web/src/components/map/MapView.tsx` (49%), `TreeMarkers.tsx` (28%) | Test integracyjny z prawdziwym `maplibregl.Map` (jsdom + canvas mock) lub zaakceptować obecny stan i zostawić notatkę |
| 8 | **Hold-to-repeat** w ArrowPad działa, ale nie jest testowane E2E (tylko unit) | `apps/web/src/components/trees/ArrowPad.tsx` | Dodać Playwright test: przytrzymaj → 5 strzałów → offset += 1.25 m |
| 9 | **GPS averaging** — obecnie bierze ostatni fix. PLAN §6.2 przewiduje uśrednianie N odczytów (dryf) | `apps/web/src/hooks/useGeolocation.ts` | Dodać opcję `averagingSamples?: number` — buforuje N ostatnich, zwraca medianę |
| 10 | **Snap-to-vertex** w PAN §4.D: "Bezpośrednio na mapie (przeciągnięcie pinezki)" | `apps/web/src/components/trees/` | Drag handler w `TreeMarkers` (maplibre-gl supports drag), snap opcjonalnie z `SnapToPoint` ULDK |

---

## 3. Następne kamienie milowe (z PLAN.md)

### ✅ Milestone 4 — TreeListPanel + marker popup (DOSTARCZONE 2026-10-01)
- Dostarczone: `TreeListPanel.tsx` (drawer z listą: gatunek/obwód/data + edytuj/usuń), `TreePopup.tsx` (popup w maplibre), toggle button, `treeStore` state (`selectedTreeId`, `listPanelOpen`), fix tree-layer rendering filter.
- Testy: 4 E2E (`tree-list.spec.ts`), 212 unit. Coverage 90.1%.
- Commit: merge `0e40999` → main.

### Milestone 5 — Kreator PDF
- **Estymata:** 4-6h
- **Scope:** PLAN §4.F
- **Stack:** `jsPDF` + `html2canvas` (potrzebny `npm install jspdf html2canvas`)
- **Layout options:** single / combined / one-per-page (per `project.pdfPrefs.layout`)
- **Marker scaling:** kolor wg gatunku, rozmiar wg obwodu (`pdfPrefs.markerScale`)
- **Map auto-rotate:** 0-90° w 15° krokach → bbox → wybór min. pola
- **Compass:** SVG overlay na mapie (północ prawdziwa)
- **Table:** gatunek × przedziały obwodów + opcjonalnie numbered full list
- **Agent:** frontend
- **Branch:** `feat/frontend-pdf`

### Milestone 6 — Per-project configuration UI
- **Estymata:** 2-3h
- **Scope:** PLAN §4.E
- **Features:** edycja listy gatunków (kolory), edycja przedziałów obwodów, edycja PDF prefs
- **Agent:** frontend
- **Branch:** `feat/frontend-project-config`

### Milestone 7 — Backup/restore JSON
- **Estymata:** 2-3h
- **Scope:** PLAN §4.H
- **Stack:** Dexie → JSON serializacja (bez Geometry → string), upload pliku, merge vs overwrite
- **Agent:** frontend
- **Branch:** `feat/frontend-backup-restore`

### Milestone 8 — Backend polish
- **Estymata:** 3-4h
- **Scope:** Alembic migrations, endpoint `/sync/trigger`, `/sync/status`, logi do osobnego pliku
- **Agent:** backend
- **Branch:** `feat/backend-migrations-sync-api`

### Milestone 9 — Infra: ETL as cron container + runbook
- **Estymata:** 2-3h
- **Scope:** issues #2, dodać `infra/scripts/operational-runbook.md` (deploy, rollback, monitoring, troubleshooting)
- **Agent:** infra
- **Branch:** `feat/infra-etl-cron-runbook`

### Milestone 10 — Real EGiB data integration
- **Estymata:** 4-8h (wymaga pobrania + przetworzenia)
- **Scope:** ETL integration z prawdziwym URL GUGiK, pierwszy pełny sync dla 1 powiatu (np. Warszawa), walidacja całego pipeline
- **Agent:** etl
- **Branch:** `feat/etl-real-data`

---

## 4. Decyzje do podjęcia (przez nadzorcę)

| Decyzja | Status | Uwagi |
|---|---|---|
| Map provider (PMTiles vs Leaflet) | ✅ PMTiles | Wybrane w PLAN §2 |
| Backend self-hosted | ✅ FastAPI | Wybrane w PLAN §11 |
| Domain | ❓ Niezdecydowane | `wycinka.app` nie jest zarejestrowane; planujemy `wycinka.panstwo.pl`? |
| Cloudflare Tunnel | 🔄 Konfig gotowy | Wymaga konta Cloudflare + domeny |
| Production server | ❓ Niezdecydowane | Hetzner VPS vs Raspberry Pi vs Cloudflare Pages |
| Auth | ❓ Brak | MVP — brak logowania. Kiedy dodać? |

---

## 5. Środowisko deweloperskie (znane ograniczenia)

### Windows + OneDrive problem

- **OneDrive sync** trzyma pliki → `coverage\.tmp` EPERM przy `npm run test:coverage` (OneDrive nie pozwala na rmdir). Workaround: ignoruj ostrzeżenie, raport coverage i tak się tworzy.
- **Ścieżki z polskimi znakami** (`Polska Agencja Żeglugi Powietrznej`) — czasem problematyczne dla ESLint cache. Rozwiązanie: sklonuj repo do katalogu bez spacji.
- **PowerShell 5.1** (nie Core) — `&&` nie działa, używaj `; if ($?) { ... }`.

### Brak Dockera na dev PC

- `infra/` walidowane przez testy (compose YAML parse, caddy validate), nie przez `docker compose up`
- `apps/api/Dockerfile` budowane ręcznie tylko gdy user ma Linux/Mac lub inny PC
- E2E Playwright odpalane lokalnie, integracja z backendem przez mocki (MSW)

### Git workflow uwaga

- **Subagenci mogą pracować równolegle** na tym samym checkout → utrata plików working tree (incident podczas infra scaffold). Rozwiązania:
  - `git worktree add ../wycinka-<branch> feat/<branch>` — każdy agent ma swój katalog
  - Lub sekwencjonowanie (każdy agent ma wyłączność do swojego katalogu)
- **Coordinator**: preferuj worktree dla bezpieczeństwa

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

**Kolejny krok:** Milestone 5 (Kreator PDF) — główna funkcja eksportu, ~4-6h. Branch `feat/frontend-pdf`.