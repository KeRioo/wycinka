# AGENTS.md

> **Dla subagentów budujących projekt wycinka.app.** Ten plik definiuje konwencje, strukturę, wymagania testowe i granice odpowiedzialności. Traktuj go jak konstytucję projektu.
>
> **Nadzorca (ja, koordynator)** zarządza scope'em, integruje wyniki i przegląda PR-y. Ty (subagent) dostarczacz konkretny moduł z testami w wyznaczonym katalogu.

---

## 0. Tryb pracy

- **Nie pytaj nadzorcy o drobiazgi** — podejmuj decyzje w ramach tego pliku i PLAN.md. Pytaj tylko o rzeczy wykraczające poza specyfikację lub konflikty w wymaganiach.
- **Nie modyfikuj plików poza swoim katalogiem właścicielskim** (patrz §3). Jeśli potrzebujesz czegoś od innego agenta — zostaw notatkę w `coordination/REQUESTS.md`.
- **Commituj po każdym logicznym kawałku** — commit ma być atomowy (jedna funkcja, jedno miejsce).
- **Testy pisz równolegle z kodem, nie po.** Minimum 80% coverage w swoim module.
- **Nie dodawaj komentarzy w kodzie** (chyba że wyraźnie o to poproszono). Kod ma być samodokumentujący się.

---

## 1. Kontekst projektu

**Cel:** Mobilna PWA do inwentaryzacji drzew na działkach leśnych w Polsce. Użytkownik dodaje drzewa z obwodem i gatunkiem na działce pobranej z EGiB. Eksportuje raport PDF z mapą i tabelą.

**Użytkownik:** Leśnik, właściciel lasu. Pracuje w terenie (słaby GPS, brak internetu). Obsługuje dotykowo w rękawicach.

**Stack:** zobacz PLAN.md §2.

**Architektura:** Self-hosted. Frontend PWA + Backend FastAPI + PMTiles z EGiB. Cloudflare Tunnel do wystawienia na zewnątrz.

**Język UI:** tylko polski.

**Język kodu:** TypeScript dla frontendu, Python dla backendu i ETL. Komentarze i commity po polsku lub angielsku — byle spójnie.

---

## 2. Struktura repo

```
wycinkaApp/
├── PLAN.md                  # architektura, decyzje, harmonogram
├── AGENTS.md                # ten plik
├── README.md                # quickstart
├── docs/
│   ├── api-contract.md      # kontrakt API (frontend ↔ backend) — NIEZMIENNIALNY
│   └── data-schema.md       # schemat bazy danych
├── apps/
│   ├── web/                 # FRONTEND (subagent: frontend)
│   └── api/                 # BACKEND (subagent: backend)
├── infra/                   # INFRASTRUKTURA (subagent: infra)
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── nginx/
│   └── cloudflared/
├── scripts/
│   └── sync-egib/           # ETL (subagent: etl)
├── data/                    # generowane runtime (w .gitignore)
│   ├── pmtiles/
│   ├── sqlite/
│   └── egib-raw/
├── coordination/            # kanał komunikacji między agentami
│   ├── REQUESTS.md
│   └── STATUS.md
└── tests/                   # testy integracyjne i E2E (cross-cutting)
```

---

## 3. Własność plików (NIE naruszaj cudzych katalogów)

| Ścieżka | Właściciel | Inne agenty mogą czytać, NIE mogą pisać |
|---|---|---|
| `apps/web/**` | **frontend** | ✓ |
| `apps/api/**` | **backend** | ✓ |
| `infra/**` | **infra** | ✓ |
| `scripts/sync-egib/**` | **etl** | ✓ |
| `tests/**` | **shared** | ✗ tylko za zgodą nadzorcy |
| `docs/**` | **supervisor** | ✗ NIE MODYFIKUJ — zmiany tylko przez nadzorcę |
| `coordination/**` | **shared** | ✓ tylko dodawaj wpisy |
| `data/**` | **etl** (writer) / **backend** (reader) | ✓ |
| `*.md` w root | **supervisor** | ✗ |
| `package.json`, `pyproject.toml` w root | **supervisor** | ✗ (oprócz workspace root, jeśli utworzony) |

**Jeśli potrzebujesz czegoś od innego agenta:**
1. Sprawdź, czy odpowiedź jest już w `coordination/STATUS.md`
2. Jeśli nie — dodaj wpis w `coordination/REQUESTS.md` z konkretnym pytaniem
3. Poczekaj na odpowiedź lub kontynuuj z mockowaną implementacją + TODO

---

## 4. Konwencje kodu

### 4.1 TypeScript (frontend)

- **Strict mode** włączony
- **Format:** Prettier defaults + 2-space indent
- **Naming:** `PascalCase` dla komponentów/types, `camelCase` dla zmiennych/funkcji, `UPPER_SNAKE_CASE` dla stałych
- **Imports:** absolutne (`@/components/...`) — skonfiguruj `tsconfig.json` paths
- **State:** Zustand dla globalnego stanu, React state dla lokalnego
- **Async:** `async/await`, NIE `.then()`
- **Error handling:** `try/catch` z konkretnymi typami błędów, NIE `catch {}`
- **Types:** preferuj `interface` dla obiektów, `type` dla union/intersection
- **NIE używaj `any`** — użyj `unknown` + type guard lub zdefiniuj typ

### 4.2 Python (backend + ETL)

- **Wersja:** Python 3.12+
- **Format:** `ruff format` + `ruff check` (strict)
- **Type hints:** obowiązkowe wszędzie (mypy strict)
- **Naming:** `snake_case` dla funkcji/zmiennych, `PascalCase` dla klas, `UPPER_SNAKE_CASE` dla stałych
- **Async:** FastAPI jest async — używaj `async def` dla endpointów
- **DB:** SQLAlchemy 2.0 (async) + Alembic dla migracji
- **Tests:** pytest + pytest-asyncio + httpx (testclient)
- **Logging:** `structlog` z JSON output w produkcji

### 4.3 Docker

- **Multi-stage builds** dla produkcji (mniejsze obrazy)
- **Alpine lub distroless** dla final images
- **Healthchecks** w docker-compose dla każdej usługi
- **Non-root user** wewnątrz kontenerów
- **Pinuj wersje** — NIE `:latest`

### 4.4 Git

- **Branch:** pracuj na feature branchu: `feat/<krótki-opis>` lub `fix/<krótki-opis>`
- **Commity:** Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- **Jeden commit = jedna logiczna zmiana**
- **PR-style message:** nawet jeśli commitujesz bezpośrednio, message ma opisywać CO i DLACZEGO
- **NIE pushuj do main** bez review nadzorcy

---

## 5. Wymagania testowe (PRIORYTET WYSOKI)

Użytkownik wyraźnie podkreślił wagę testów. Traktujemy to seriously:

### 5.1 Coverage

- **Minimum 80%** line coverage w twoim module (tools: `vitest --coverage` / `pytest --cov`)
- **100%** dla krytycznych ścieżek (np. parsowanie WKT, obsługa CORS, autoryzacja)
- Coverage raport w `coverage/` (w .gitignore, ale dołącz `coverage-summary.txt` w PR)

### 5.2 Typy testów

| Typ | Kiedy | Narzędzie |
|---|---|---|
| **Unit** | Każda funkcja utility, parser, helper | vitest / pytest |
| **Integration** | Endpointy API, komponenty z zależnościami | vitest + Testing Library / pytest + httpx |
| **E2E** | Krytyczne ścieżki użytkownika (dodaj działkę → dodaj drzewo → eksport PDF) | Playwright |
| **Contract** | API contract zgodny z `docs/api-contract.md` | Dredd / Prism / rspec-openapi (albo ręczne testy httpx) |
| **Property-based** | Parsery (WKT), walidatory | fast-check (TS) / hypothesis (Py) |
| **Snapshot** | Renderowanie PDF, generowanie mapy (ostrożnie — duże pliki) | Playwright / Vitest snapshot |
| **Performance** | Czas renderingu mapy, czas query /parcel | k6 / autocannon / pytest-benchmark |

### 5.3 Co MUSI być pokryte testami

**Backend:**
- ✅ Każdy endpoint (happy path + minimum 2 scenariusze błędne)
- ✅ Parser WKT (włącznie z MULTIPOLYGON, holes, edge cases)
- ✅ R-tree spatial query (poprawność + wydajność dla ~35M rekordów)
- ✅ PMTiles Range request handling
- ✅ CORS headers
- ✅ Healthcheck
- ✅ DB migrations

**Frontend:**
- ✅ Każdy komponent mapy (render, click, zoom)
- ✅ Integracja z API (mockowane odpowiedzi)
- ✅ Geolokalizacja (z mockiem navigator.geolocation)
- ✅ Dexie schema i migracje
- ✅ Form validation (react-hook-form + zod)
- ✅ PDF generation (test renderowania, nie pełnego outputu)
- ✅ PWA: manifest, service worker registration
- ✅ Offline mode (symulowany)

**ETL:**
- ✅ Download z retry logic (mockowany HTTP)
- ✅ Merge GPKG
- ✅ tippecanoe invocation (mockowana lub fixture)
- ✅ SQLite import z R-tree
- ✅ Atomicity (co się dzieje gdy pipeline padnie w połowie)

**Infra:**
- ✅ Docker Compose: `docker compose config` validation
- ✅ nginx config: `nginx -t` w CI
- ✅ cloudflared config: JSON schema validation

### 5.4 Konwencje testów

```typescript
// TypeScript (vitest)
describe('Component', () => {
  it('should do X when Y', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

```python
# Python (pytest)
def test_function_when_condition_then_expected():
    # Arrange
    # Act
    # Assert
```

- **Nazwy testów:** `should X when Y` (TS) / `test_X_when_Y_then_Z` (Py)
- **Jeden assert per test** idealnie (mniej = lepiej)
- **Mockuj zależności zewnętrzne** (HTTP, DB, GPS)
- **NIE mockuj tego co testujesz**
- **Fixtures > setup** — reużywalne dane testowe
- **Determinizm** — żadnych `Date.now()` w testach (użyj `vi.useFakeTimers()` / `freezegun`)

### 5.5 Test data

- **NIE commituj** danych produkcyjnych ani dużych (>1 MB) do repo
- **Fixtures w katalogu `__fixtures__/`** lub `tests/fixtures/`
- **Dane realistyczne** — nie `foo`, `bar`, ale prawdziwe nazwy gatunków, poprawne TERYT
- **Generator danych testowych** w `tests/helpers/` jeśli potrzeba dużo

---

## 6. Workflow pracy subagenta

1. **Przeczytaj PLAN.md i ten plik** w całości
2. **Sprawdź `coordination/STATUS.md`** — co już zrobili inni agenci
3. **Sprawdź `coordination/REQUESTS.md`** — czy ktoś czegoś potrzebuje
4. **Utwórz feature branch:** `git checkout -b feat/<twoj-modul>`
5. **Zaimplementuj swój kawałek** w wyznaczonym katalogu
6. **Pisz testy na bieżąco** (TDD mile widziane)
7. **Sprawdź coverage** — `npm run test:coverage` / `pytest --cov`
8. **Lint i format** — `npm run lint` / `ruff check . && ruff format .`
9. **Sprawdź że wszystko się buduje** — `docker compose build` / `npm run build`
10. **Commituj atomowo** z dobrymi message'ami
11. **Zaktualizuj `coordination/STATUS.md`** — co zrobiłeś, co zostawiłeś TODO, znalezione problemy
12. **NIE merguj do main** — zostaw to nadzorcy

### Jak zgłaszać problemy

- **Bug w kodzie innego agenta:** wpis w `coordination/REQUESTS.md` z opisem i reprodukcją
- **Niejawne wymaganie:** wpis w `coordination/REQUESTS.md` z propozycją rozwiązania
- **Decyzja architektoniczna:** sprawdź PLAN.md, jeśli nie ma — zaproponuj w `coordination/REQUESTS.md` i kontynuuj z najlepszą hipotezą
- **Blokada (nie możesz iść dalej):** natychmiast zgłoś nadzorcy

---

## 7. Kontrakt API (frontend ↔ backend)

**NIEZMIENNIALNY** — oba agenty implementują dokładnie ten kontrakt. Zmiany tylko przez nadzorcę.

Zobacz: [`docs/api-contract.md`](./docs/api-contract.md)

**Skrót:**
- `GET /health` → status serwisu
- `GET /api/v1/parcel?lat=X&lng=Y` → pełna działka (GeoJSON + metadane) dla klikniętego punktu
- `GET /api/v1/search?q=...` → wyszukiwarka po TERYT lub numerze
- `GET /api/v1/pmtiles/dzialki` → binary PMTiles z Range support
- `GET /api/v1/version` → wersja API + data danych

---

## 8. Domenowa wiedza (potrzebna do testów)

### 8.1 EGiB / ULDK

- **TERYT działki** format: `WWPPGG_R.OOOO.NR_DZ` np. `141201_1.0001.6509`
  - `WW` = województwo (2 cyfry)
  - `PP` = powiat (2 cyfry)
  - `GG` = gmina (2 cyfry)
  - `_R` = rodzaj jednostki (1 = miasto, 2 = wieś, 3-5 = inne)
  - `.OOOO` = obręb (4 cyfry)
  - `.NR_DZ` = numer działki (z `/` dla podzielonych)
- **Przykłady:**
  - `141201_1.0001.6509` — obręb 0001 w miejskiej dzielnicy Warszawy
  - `226101_1.0001.12/3` — działka 12/3 (podzielona)

### 8.2 KIEG WMS

- URL: `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`
- Warstwy istotne: `dzialki`, `obreby`, `numery_dzialek`, `uzytki`
- CRS: EPSG:2180 (PUWG 1992), EPSG:4326 (WGS84), EPSG:3857

### 8.3 PMTiles

- Format single-file dla tiled data (vector lub raster)
- Wymaga HTTP Range support (Nginx, Cloudflare R2, S3 — wszystkie wspierają)
- Biblioteka JS: `pmtiles` (https://github.com/protomaps/PMTiles)
- Integracja z MapLibre: `maplibregl.addProtocol('pmtiles', pmtilesProtocol)`

### 8.4 Gatunki drzew (leśne PL)

Startowa lista (edytowalna per projekt):
Dąb, Buk, Sosna, Świerk, Jodła, Modrzew, Brzoza, Olsza, Topola, Wierzba, Lipa, Klon, Jesion, Grab, Jarzębina, Robinia (akacja), Kasztan, Orzech, Czereśnia, Jabłoń, Grusza, Śliwa, Inne

### 8.5 Przedziały obwodów

Domyślne (co 25 cm od 50 cm):
- `< 50cm`
- `50-75 cm`
- `75-100 cm`
- `100-125 cm`
- `125-150 cm`
- `150-200 cm`
- `> 200 cm`

---

## 9. Definition of Done

Twój moduł jest gotowy gdy:

- [ ] Kod spełnia konwencje z §4
- [ ] Coverage ≥ 80% (krytyczne ścieżki 100%)
- [ ] Wszystkie testy przechodzą lokalnie
- [ ] `npm run lint` / `ruff check` bez błędów
- [ ] `npm run build` / `docker build` się powodzi
- [ ] Brak `console.log` / `print` debug output
- [ ] Brak TODO comments w kodzie produkcyjnym (tylko w `TODO.md` jeśli konieczne)
- [ ] README w twoim katalogu opisuje co i jak uruchomić
- [ ] `coordination/STATUS.md` zaktualizowany

---

## 10. Kontakt z nadzorcą

- **Pliki w `coordination/`** — jedyny oficjalny kanał komunikacji
- **NIE edytuj** dokumentów w `docs/` — to robota nadzorcy
- **Jeśli masz pytanie architektoniczne** — sprawdź PLAN.md, jeśli nie ma odpowiedzi, dodaj do `REQUESTS.md` i kontynuuj z hipotezą

**Powodzenia. Pisz czytelny kod, testuj wszystko, nie psuj innym buildów.**
