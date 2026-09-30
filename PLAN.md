# Plan: wycinka.app — PWA do inwentaryzacji drzew

> Dokument roboczy. Aktualizowany w trakcie analizy. Implementacja jeszcze się nie rozpoczęła.

---

## 1. Cel aplikacji

Mobilna PWA (bez backendu) do inwentaryzacji drzew na działkach leśnych:
- Pobieranie obrysu działki z ULDK GUGiK lub ręczne wprowadzanie
- Dodawanie drzew w punkcie GPS z korektą (słaby sygnał w lesie)
- Parametry: gatunek, obwód (cm), opcjonalne notatki
- Eksport PDF z mapą poligonu, drzewami (kolor/wielkość), legendą i tabelą gatunek × przedziały obwodów

---

## 2. Stack technologiczny

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Build | **Vite** + React 18 + TypeScript | Lekki, szybki, idealny do PWA |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest + service worker offline |
| Routing | **React Router v6** | Standard |
| Stan | **Zustand** + **immer** | Lekki, wystarczający |
| UI | **Tailwind CSS** + **shadcn/ui** | Motyw leśny, szybki development |
| Formularze | **react-hook-form** + **zod** | Walidacja |
| Baza lokalna | **Dexie.js** (IndexedDB) | Działki, drzewa, konfiguracja |
| Mapy | **MapLibre GL JS** + **react-map-gl** | Lepsze wsparcie PMTiles/vector tiles niż Leaflet |
| Mapy (legacy) | **Leaflet** + **react-leaflet** | Fallback dla starszych urządzeń |
| Wektorowe kafelki | **PMTiles** + `pmtiles` lib | Single-file hosting, HTTP range requests |
| Geometria / GIS | **Turf.js** + **proj4** (EPSG:2180 ↔ 4326) | Obroty, bbox, snap |
| GPS | Geolocation API | `watchPosition`, `enableHighAccuracy` |
| PDF | **jsPDF** + **html2canvas** | Render mapy + tabeli do PDF |
| Ikony | **lucide-react** | |
| Animacje | **framer-motion** | Panel FAB, przejścia |
| HTTP | **ky** | Klient HTTP z retry i timeout |
| **Backend (opcja)** | **FastAPI** + **SQLite/RTree** + **tippecanoe** | Self-hosted PMTiles + query API (wariant B) |
| **Hosting** | **Cloudflare R2** + **Pages** lub **Hetzner VPS** | PMTiles storage + API |

> **Uwaga o backendzie:** oryginalnie plan zakładał brak backendu (czyste PWA). Po analizie okazało się, że **self-hosting PMTiles jest tak tani i tak bardzo upraszcza temat CORS/offline**, że rozważamy wariant z minimalnym backendem (hosting plików + opcjonalne query API). Szczegóły w **§11**.

---

## 3. Model danych (Dexie / IndexedDB)

```
projects
├─ id, name, plotId (TERYT), createdAt
├─ polygon: GeoJSON Polygon (z ULDK lub ręcznie)
├─ bbox: [minX, minY, maxX, maxY]
├─ speciesConfig: [{ name, color }]      // edytowalne per projekt
├─ rangesConfig: [{ from, to, label }]   // domyślnie 50-75, 75-100, ..., >200
├─ pdfPrefs: {
│    layout: 'single' | 'combined' | 'one-per-page',
│    markerColorBy: 'species',
│    markerSizeBy: 'circumference' | 'fixed',
│    markerScale: { baseSize, perCm, maxSize },
│    showNumberedTable: boolean,
│    tableOnSeparatePage: boolean,
│    autoRotate: boolean
│  }
└─ uldkMeta: { fetchedAt, datasource }    // info o źródle

trees
├─ id, projectId
├─ lat, lng, accuracy (m), capturedAt
├─ manualOffset: { dx: 0, dy: 0 }        // przesunięcie strzałkami 25cm
├─ species (string)
├─ circumference (cm)
└─ notes

globalPresets (tylko do odczytu)
├─ species: [{ name, color }]
└─ ranges: [{ from, to, label }]
```

---

## 4. Funkcjonalności

### A. Działki — tworzenie

**Główny flow: klikanie na mapie z podglądem (prymitywny tryb wizualny)**

1. Użytkownik otwiera „Dodaj działkę"
2. Wyświetla się mapa z **OSM** jako bazą + warstwa **KIEG WMS** (działki + obręby + numery) nałożona od ~zoom 13
3. Użytkownik klika w wybrane miejsce
4. Aplikacja wywołuje ULDK `GetParcelByXY(lng, lat, 4326)`
5. Jeśli znaleziono → podgląd: poligon działki podświetlony na żółto/zielono, popup z metadanymi (TERYT, gmina, obręb, nr, powierzchnia z EGiB)
6. Użytkownik potwierdza → zapis do IndexedDB

**Ścieżki alternatywne (gdy KIEG/ULDK nie działa, brak sieci lub CORS blokuje):**

| Ścieżka | Kiedy używana |
|---|---|
| Wpisanie pełnego ID TERYT (`141201_1.0001.6509`) | Użytkownik zna identyfikator |
| `GetParcelByIdOrNr` z nazwą obrębu + numerem | Nazwa obrębu + numer działki — lista wyników |
| Wklejenie WKT/GeoJSON | Skopiowany z Geoportal2.pl / QGIS |
| Chodzenie po granicy (GPS points) | Offline fallback — brak jakiejkolwiek sieci |
| Link do Geoportal2.pl | Otwarcie w nowej karcie → ręczne skopiowanie WKT |

### A.1 Sąsiednie działki

**Cel:** z pobranej działki użytkownik może dodać sąsiednie.

**Flow:**
1. Na widoku projektu przycisk **„Dodaj sąsiednią działkę"**
2. Otwiera się mapa (KIEG WMS overlay)
3. Użytkownik klika na sąsiednią działkę — ten sam flow co w A
4. Po dodaniu: pytanie „Dodać kolejnego sąsiada?"
5. **Na koniec:** opcja **„Połącz geometrie wybranych"** → ULDK `GetAggregateArea` (wielokąt lub MULTIPOLYGON)

### B. Dodawanie drzewa (FAB)
1. FAB u dołu → wysuwany panel (framer-motion, spring)
2. W panelu:
   - Mapa z pinezką w aktualnej pozycji GPS
   - **Strzałki ↥↧↤↦ (skok 25cm)** — przesuwają pinezkę (Turf `destination`)
   - Wskaźnik dokładności GPS
   - Wybór gatunku (z listy projektu)
   - Obwód (cm) — input numeryczny
   - Notatka (opcjonalnie)
   - Zapisz / Anuluj

### C. Widok mapy projektu
- Poligon obrysu
- Drzewa jako markery (kolor gatunku)
- Tryby: jedna działka / wszystkie
- Klik markera → popup ze szczegółami + edycja

### D. Edycja pozycji drzewa
- Bezpośrednio na mapie (przeciągnięcie pinezki)
- Strzałkami 25cm w panelu edycji
- Opcjonalnie: snapowanie do najbliższego wierzchołka poligonu (`SnapToPoint`)

### E. Konfiguracja per projekt
- Lista gatunków (kopia domyślnej → edytowalna)
- Przedziały obwodów (np. 50-75, 75-100, ...)
- Preferencje PDF

### F. Generowanie PDF
Konfigurowalny kreator eksportu:
- **Układ:** jedna działka / strona, wszystkie na jednej, wiele stron (jedna działka / strona)
- **Markery:**
  - Kolorowanie wg gatunku (zawsze)
  - Rozmiar wg obwodu — edytowalna skala (np. 50cm→3px, 100cm→6px, ...)
- **Mapa:**
  - Auto-obrót 0–90° (Turf `transformRotate`) → bbox → wybór min. pola
  - Kompas (róża wiatrów) — północ prawdziwa
  - Skalowanie do A4
- **Tabela:**
  - Przełącznik: „na tej samej stronie" / „na kolejnej stronie"
  - Dwie wersje: zbiorcza (gatunek × przedziały) i/lub pełna (nr drzewa, gatunek, obwód, lokalizacja)
- **Stopka:** data, liczba drzew, sumaryczny obwód

### G. PWA / offline
- Instalacja na iOS i Android
- Service Worker: assety CacheFirst, ULDK NetworkFirst
- Brak kafelków mapy — tło renderowane Canvas (siatka + ramka poligonu)

### H. Backup / restore
- Eksport całej bazy do JSON
- Import JSON (z nadpisywaniem lub scalanie)

---

## 5. Integracja z ULDK — szczegóły

### 5.1 Dostępne endpointy (istotne dla projektu)

| Metoda | Parametry | Zastosowanie |
|---|---|---|
| `GetParcelById` | `id={TERYT}` | Precyzyjne wyszukanie działki |
| `GetParcelByIdOrNr` | `id={nazwa nr}` lub `id={TERYT}` | Wyszukiwanie po nazwie obrębu |
| `GetParcelByXY` | `xy={X,Y,SRID}` | **Działka dla klikniętego punktu na mapie** |
| `GetParcelById` (batch) | wywoływany dla każdego kandydata | Pobranie pełnej geometrii wykrytego sąsiada |
| `GetAggregateArea` | `id={id1,id2,...}` | Łączenie geometrii wybranych sąsiadów |
| `SnapToPoint` | `xy={X,Y}`, `radius` | Przyciąganie do wierzchołka działki |
| `GetRegionByNameOrId` | `id={nazwa lub TERYT}` | Wyszukanie obrębu |

### 5.1a KIEG WMS — warstwa działek na mapie

**Źródło:** `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` (usługa zbiorcza 380 serwerów powiatowych)

**Dostępne warstwy (istotne):**

| Warstwa | Co zawiera | Min/Max scale | Użycie |
|---|---|---|---|
| `obreby` | Granice obrębów ewidencyjnych | 10k–25k | Kontekst administracyjny |
| `dzialki` | Granice działek ewidencyjnych | do 10k | **Główna warstwa — granice działek** |
| `numery_dzialek` | Numery działek (tekst) | do 1500 | Widoczne przy dużym zoomie |
| `geoportal` | Działki — uzupełnienie z LPIS | do 2500 | Brakujące geometrie z LPIS (agencja rolna) |
| `uzytki` | Użytki gruntowe (Ls, Lz, R, B...) | do 10k | Filtrowanie lasów (Ls) — przydatne do wstępnego wyboru |
| `budynki` | Budynki | do 2500 | Niepotrzebne — pomijamy |

**CRS:** EPSG:2180 (PUWG 1992), 2176–2179, **4326 (WGS84)**, **3857 (Web Mercator)**

**Leaflet:**
```js
L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', {
  layers: 'obreby,dzialki,numery_dzialek',
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
  attribution: '© GUGiK'
})
```

**Zachowanie w aplikacji:**
- Warstwa widoczna od zoom 13 (`dzialki` ma MaxScaleDenominator=10000)
- Przy zoom <13 — tylko obręby (kontekst)
- Toggle w UI: „Pokaż działki ewidencyjne" (on/off)
- Kafelki WMS cache'owane przez Workbox (StaleWhileRevalidate) — do użytku w lekkim offline
- Brak danych WMS w danym powiecie → UI: „Brak danych EGiB dla tego powiatu. Użyj trybu ręcznego."

### 5.2 Parametry wyniku (`result`)

Używane w projekcie:
- `geom_wkt` — geometria w WKT (tekstowy, łatwy do parsowania)
- `teryt`, `parcel`, `voivodeship`, `county`, `commune`, `region` — metadane działki
- `datasource` — informacja o źródle danych (diagnostyka)

### 5.3 Układ współrzędnych

- **Domyślnie:** EPSG:2180 (PUWG 1992)
- **Wynik:** żądamy `srid=4326` (WGS84) → gotowe dla Leaflet
- **Fallback:** jeśli `srid` nie konwertuje, parsujemy WKT w 2180 i transformujemy przez `proj4`

### 5.4 Konwersja WKT → GeoJSON

- Wielokąt = `POLYGON ((x1 y1, x2 y2, ..., x1 y1))`
- Wiele działek = `MULTIPOLYGON` (z `GetAggregateArea`)
- Parser: dedykowana funkcja (regex na strukturę + split po przecinkach)
- Pierścień zewnętrzny + opcjonalne otwory (holes) — obsłużyć oba

### 5.5 Wykrywanie sąsiadów — klikanie na mapie (bez offsetów)

Zrezygnowano z automatycznego wykrywania offsetami (zbyt losowe). Zamiast tego **użytkownik klika kolejne sąsiednie działki** na mapie — ten sam flow co dodawanie pierwszej.

**UI flow:**
1. Na widoku projektu → „Dodaj sąsiednią działkę" → mapa (KIEG WMS overlay)
2. Użytkownik klika sąsiada → podgląd poligonu → „Dodaj do projektu"
3. Wielokrotne dodawanie, aż użytkownik zakończy
4. Na końcu opcja **„Połącz wszystkie geometrie"** → ULDK `GetAggregateArea`

**Opcjonalne wsparcie heurystyczne** (zaawansowane):
- Po pobraniu klikniętej działki automatycznie podświetl „kandydatów na sąsiadów" z WMS (działki stykające się z pobraną)
- Użytkownik może jednym klikiem dodać wszystkie widoczne sąsiady

**Fallback gdy brak sieci / ULDK/KIEG nie działa:**
- Ręczne wpisanie identyfikatorów sąsiadów (textarea, np. `141201_1.0001.6509, 141201_1.0001.6510`)
- Użycie `GetAggregateArea` do połączenia ręcznie wpisanych ID
- Wklejenie WKT osobno dla każdej działki

### 5.6 Hardkodowana lista TERYT (wizard wyszukiwania)

Aby ułatwić użytkownikowi znalezienie działki bez znajomości pełnego ID:
1. Wybór **województwa** — lista 16 + kod TERYT (hardcoded)
2. Wpisanie **gminy** — `GetCommuneByName` (nie istnieje!) → **fallback:** pole tekstowe z walidacją TERYT lub przeglądanie
3. Wpisanie **obrębu** + **numeru działki** → `GetParcelByIdOrNr` → lista wyników do wyboru

### 5.7 Kolejność wywołań przy dodawaniu działki

```
[Dodaj działkę]
  ├─ Mapa z KIEG WMS overlay + OSM base
  ├─ Użytkownik klika punkt na mapie
  ├─ App wywołuje ULDK GetParcelByXY(lng,lat,4326)
  ├─ WMS highlight + popup z metadanymi
  ├─ Użytkownik potwierdza
  └─ Zapis do IndexedDB
      ├─ [Opcjonalnie] "Dodaj sąsiadów" → powtórzenie flow (5.1)
      └─ [Opcjonalnie] "Połącz geometrie" → GetAggregateArea(id1,id2,...)
```

### 5.8 Architektura warstw mapy

```
Warstwa (od dołu do góry):
  1. OSM tiles (base) — kontekst topograficzny
  2. KIEG WMS — obrysy działek (raster, tylko zoom ≥13)
  3. Zapisane geometrie z IndexedDB — poligony dodanych działek (wektor, kolorowane)
  4. Drzewa — markery (kolor wg gatunku, rozmiar wg obwodu)
  5. Aktualna pozycja GPS użytkownika (jeśli udostępniona)
  6. Pinezka dodawanego drzewa (overlay)
```

**Tryby wyświetlania warstw (toggle w UI):**
- ☐ Mapa bazowa OSM
- ☑ Warstwa EGiB (KIEG)
- ☑ Granice zapisanych działek
- ☑ Drzewa (zawsze włączone w trybie projektu)

**Offline fallback (gdy brak sieci):**
- Warstwy 1–2 znikają (brak danych)
- Warstwy 3–6 zostają (lokalne)
- Mapa „pusta" — tło siatki + granice z bazy lokalnej + drzewa

---

## 6. Zidentyfikowane problemy i ryzyka

### 6.1 ULDK — problemy techniczne

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| 1 | **CORS — ULDK** może blokować zapytania cross-origin z przeglądarki | Wysokie | (a) Test przy pierwszym uruchomieniu. (b) Fallback: Cloudflare Worker / funkcja serverless jako proxy. (c) Ręczne wklejenie WKT z Geoportal2 |
| 2 | **CORS — KIEG WMS** (raster) | Niskie | WMS jako kafelki PNG zwykle nie wymaga CORS (przeglądarka pobiera obrazy). Test przy starcie |
| 3 | **CORS — KIEG GetFeatureInfo** | Średnie | Prawdopodobnie zablokuje; alternatywa — klik → wywołanie ULDK `GetParcelByXY` |
| 4 | **Format WKB (domyślny)** — binarny, trudny do parsowania w JS | Średnie | Zawsze żądać `geom_wkt` zamiast `geom_wkb` |
| 5 | **Współrzędne w PUWG 1992** — domyślny układ ULDK | Niskie | Używać `srid=4326` w zapytaniu. Fallback: `proj4` |
| 6 | **Wyszukiwanie po nazwie obrębu** — niejednoznaczne | Średnie | UI: lista wyników z podziałem na powiaty |
| 7 | **Brak internetu w lesie** | Wysokie | Cache geometrii w IndexedDB; WMS kafelki cache'owane Workbox (ograniczone) |
| 8 | **Aktualność danych EGiB** — opóźnienia w aktualizacji | Średnie | `fetchedAt` + `datasource`. Ostrzeżenie przy >6 mies. |
| 9 | **Rate limiting** — usługa publiczna | Niskie | Throttle 1 req/s |
| 10 | **Niepełne pokrycie KIEG** — nie wszystkie powiaty włączone do usługi zbiorczej | Średnie | Fallback: ręczne wprowadzanie + ostrzeżenie w UI |
| 11 | **TERYT format** — `WWPPGG_R.OOOO.NR_DZ` trudny | Średnie UX | Wizard z listą województw |
| 12 | **Brak `GetXByName`** dla region/county/commune | Niskie | Hardkodowana lista TERYT |
| 13 | **SnapToPoint a GPS** — różne układy | Niskie | Konwersja `proj4` |

### 6.1a Sąsiednie działki (klikanie) — problemy specyficzne

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| N1 | Użytkownik klika dokładnie na granicy dwóch działek | Średnie | ULDK `GetParcelByXY` zwraca jedną; UI: „pewność" na podstawie odległości od środka |
| N2 | Wiele sąsiadów do dodania — żmudne klikanie | Niskie | Bulk tryb z multi-select (klik = toggle), „Dodaj zaznaczone" |
| N3 | Brak warstwy WMS w danym powiecie → użytkownik nie widzi granic | Średnie | Tryb „wklej ID sąsiadów" (textarea + `GetAggregateArea`) |
| N4 | Agregat zwraca `MULTIPOLYGON` dla niegraniczących działek | Niskie | Obsługa w parserze WKT + ostrzeżenie w UI |

### 6.2 GPS — problemy

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| 1 | Słaby sygnał GPS w lesie (5-30m błędu) | Wysokie | Wskaźnik `accuracy`, strzałki 25cm, snapowanie do wierzchołków działki |
| 2 | Dryf GPS — pozycja „skacze" przy staniu | Średnie | Opcja uśredniania N odczytów (Turf) |
| 3 | Brak GPS w budynku / piwnicy | Niskie | Fallback: ręczne współrzędne |

### 6.3 PDF — problemy

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| 1 | Render mapy Leaflet do statycznego obrazu | Średnie | Bez kafelków — Canvas/SVG łatwo eksportowalne (`leaflet-image`) |
| 2 | Obrót mapy 0–90° w PDF | Średnie | Turf `transformRotate` + iteracja kątów, wybór min bbox |
| 3 | Kompas musi pokazywać prawdziwą północ mimo obrotu | Niskie | Kompas renderowany osobno, niezależnie od mapy |
| 4 | Skalowanie do A4 — różne DPI | Niskie | `html2canvas` z `scale: 2`, docelowy rozmiar w mm w `jsPDF` |

### 6.4 UX / użyteczność

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| 1 | Użytkownik w rękawicach zimą | Średnie | Duże przyciski, minimalny zoom/gest |
| 2 | Ekran telefonu oświetlony słońcem | Niskie | Tryb wysokiego kontrastu w motywach |
| 3 | Bateria — GPS + ekran | Niskie | Tryb „eco" (rzadsze odczyty GPS) |
| 4 | Literówki w gatunkach | Średnie | Autocomplete z listy projektu |

### 6.5 Prywatność / dane

| # | Problem | Ryzyko | Rozwiązanie |
|---|---|---|---|
| 1 | Dane tylko lokalne — ryzyko utraty przy awarii urządzenia | Wysokie | Eksport/import JSON + zachęta w UI |
| 2 | Brak szyfrowania IndexedDB | Niskie | Standard PWA; dla wrażliwych danych — opcjonalne hasło (poza MVP) |

---

## 7. Struktura katalogów (planowana)

```
src/
├─ app/                # routing, layout, providers
├─ features/
│  ├─ projects/        # CRUD działek, ULDK wizard, polygon editor
│  ├─ trees/           # FAB, panel dodawania, lista, edycja
│  ├─ map/             # Leaflet wrapper, markery, warstwy
│  ├─ pdf/             # kreator eksportu, render PDF
│  └─ settings/        # gatunki, przedziały, preferencje
├─ db/                 # Dexie schema, migracje
├─ services/
│  ├─ uldk.ts          # klient ULDK
│  ├─ geo.ts           # GPS, proj4, turf helpers
│  ├─ wkt.ts           # parser WKT → GeoJSON
│  └─ pdf.ts           # render mapy i tabeli
├─ components/ui/      # shadcn/ui
├─ hooks/
├─ stores/             # zustand
└─ lib/                # utils

public/
├─ manifest.webmanifest
└─ icons/
```

---

## 8. Kolejność implementacji (proponowana)

1. Bootstrap: Vite + TS + Tailwind + PWA + Dexie + routing
2. CRUD działek + Dexie schema
3. **Klient ULDK + parser WKT + walidacja CORS (ULDK i KIEG)**
4. **Mapa z OSM + KIEG WMS overlay** (Leaflet + react-leaflet)
5. **Flow dodawania działki klikiem na mapie** (GetParcelByXY + preview)
6. Sąsiednie działki (klikanie kolejnych) + `GetAggregateArea`
7. Ręczne wprowadzanie poligonu (chodzenie po granicy, wklejanie WKT)
8. FAB + panel dodawania drzewa + GPS + strzałki 25cm
9. Widok mapy projektu + markery (kolor/wielkość)
10. Ustawienia (gatunki, przedziały) per projekt
11. Kreator PDF + algorytm obrotu + eksport
12. Backup/restore JSON
13. PWA: testy offline, instalacja, ikony, cache strategie
14. Stylizacja motywu leśnego + UX detale

---

## 10. Architektura alternatywna: self-hosted (analiza)

### 10.1 Koncepcja

Zamiast polegać w 100% na ULDK + KIEG WMS GUGiK, **pobrać całość danych EGiB dla Polski i hostować samodzielnie** z tygodniową synchronizacją. Eliminuje to główne ryzyka:
- CORS (kontrolowany serwer)
- Brak internetu w lesie (dane lokalnie w PMTiles/IndexedDB)
- Rate limiting GUGiK
- Niedostępność usługi GUGiK

### 10.2 Źródło danych

**Moduł „Pobierz dane" na geoportal.gov.pl → Dane powiatowe:**
- **GeoParquet** — cały kraj lub województwo (~5–15 GB)
- **GeoPackage (GPKG)** — województwo lub powiat (~50–300 MB per powiat)
- **Zbiorczy WFS EGiB** (od 16.07.2026) — `https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza`
- Aktualizacja: co tydzień (wystarczająco dla większości zmian ewidencyjnych)
- Licencja: otwarte dane publiczne (INSPIRE), wymaga atrybucji „GUGiK + Starosta [powiat]"

**Szacowany rozmiar:**
- Polska: ~35 mln działek
- GPKG pełen atrybutów: ~10 GB
- PMTiles (z atrybutami: TERYT, nr, obręb, powierzchnia, użytki): **~1.5–3 GB**
- PMTiles (tylko geometria): ~500 MB

### 10.3 Warianty architektury

#### **Wariant A: Pure static hosting — minimalny backend**

```
[Co tydzień]                              [Zawsze]
geoportal.gov.pl                          Cloudflare R2
    │                                          │
    ▼                                          ▼
cron (Hetzner CX11 €3.5/mo)               PMTiles file
    │                                       (1.5–3 GB)
    ├─ download GPKG per powiat            free egress
    ├─ tippecanoe → PMTiles                       │
    └─ upload ─────────────────────────────────► │
                                                       
Cloudflare Pages                                   │
    │                                               │
    ▼                                               ▼
Browser (PWA)  ◄─── OSM tiles (standard) ──────────┘
              ◄─── PMTiles (parcel polygons) ──────┘
              ◄─── identyfikacja: ULDK (jak dotąd)
```

- **Hosting PMTiles:** Cloudflare R2 (€0.015/GB/mies, free egress)
- **Sync worker:** Hetzner CX11 €3.5/mies (lub GitHub Actions cron — free dla publicznych repo)
- **Frontend:** Cloudflare Pages (free)
- **Identyfikacja działki (klik → ID):** nadal ULDK (lub wklejanie WKT)
- **Koszt:** ~€4/mies

#### **Wariant B: PMTiles + tiny query API (REKOMENDOWANY)**

```
[Co tydzień]                              [Zawsze]
geoportal.gov.pl                          Hetzner CX22 (€4.5/mo)
    │                                          │
    ▼                                          ├─ PMTiles file
cron (ten sam VPS)                          ├─ SQLite + R-tree
    │                                          └─ FastAPI
    ├─ download GPKG                              │
    ├─ tippecanoe → PMTiles                       ├─ GET /parcel?lat&lng
    ├─ sqlite-import + R-tree index              │      → GeoJSON
    └─ restart API                                │
                                                   ▼
                                            Browser (PWA)
                                            ◄── OSM tiles (OSM CDN)
                                            ◄── PMTiles (parcel polygons)
                                            ◄── /parcel API (identyfikacja)
                                            ✦ offline: PMTiles cache + API cache
```

- **Hosting:** Hetzner CX22 (€4.5/mies) — 4 GB RAM, 40 GB SSD wystarczy
- **Dodatkowe komponenty:**
  - `tippecanoe` — generator PMTiles (1–3h dla całej Polski)
  - SQLite z rozszerzeniem **R-tree** (spatial index) — szybkie lookup „punkt → działka"
  - FastAPI z endpointem `GET /parcel?lat=X&lng=Y` → zwraca pełny GeoJSON
- **Cache w przeglądarce:**
  - PMTiles: Workbox `CacheFirst` (1–3 GB quota per origin → dużo)
  - API responses: Workbox `StaleWhileRevalidate`
- **Koszt:** ~€5/mies (jeden VPS)

#### **Wariant C: Pełny PostGIS + pg_tileserv**

- VPS €15/mies (większy storage + RAM)
- PostGIS z wszystkimi działkami
- pg_tileserv generuje MVT on-the-fly
- Najbardziej elastyczne, ale **overkill** dla naszego use case
- Rekomendacja: tylko gdybyśmy chcieli budować ogólne narzędzie GIS

### 10.4 Pipeline tygodniowy (Wariant B)

```
1. Trigger: niedziela 03:00 (cron)
2. Równoległy download 380 plików GPKG (per powiat):
   - parallel: 20 req
   - timeout: 30s per request
   - retry: 3x
   - czas: ~30–60 min
3. Konkatenacja: ogr2ogr merge → jeden GPKG
4. Generowanie PMTiles:
   tippecanoe \
     --output=poland.pmtiles \
     --name=dzialki \
     --minimum-zoom=4 --maximum-zoom=18 \
     --base-zoom=14 \
     --drop-densest-as-needed \
     --extend-zooms-if-still-dropping \
     --force \
     poland.gpkg
   - czas: ~30–90 min, CPU-bound
5. Import do SQLite:
   - schema: id (TERYT), nr, gmina, powiat, obręb, powierzchnia, użytki, geom_wkt
   - R-tree virtual table: rtree_parcels(minX, maxX, minY, maxY, id)
   - czas: ~20 min
6. Upload PMTiles do R2 lub katalogu serwowanego przez nginx
7. Restart FastAPI (lub SIGHUP)
8. Cleanup starych plików

Całość: 1.5–3h. Wymaga monitoringu (alert jeśli fail).
```

### 10.5 Format PMTiles — kluczowe

PMTiles to single-file format dla tiled data:
- Vector tiles (MVT) — geometria działek renderowana po stronie klienta
- Atrybuty TERYT/nr/obręb dołączone do features (nie tylko geometria)
- Przeglądarka pobiera tylko widoczne tile'e (HTTP range requests)
- Działa z **MapLibre GL JS** natywnie (przez `pmtiles://` protokół)
- Z Leaflet: przez plugin `leaflet-pmtiles` lub rasteryzacja

**Zalety PMTiles:**
- Zero konfiguracji serwera (tylko static file z Range support)
- Cloudflare R2 / Nginx / nawet GitHub Pages
- Rozmiar: po tippecanoe compression — ułamek oryginału

**Struktura pliku:**
```
poland.pmtiles (~2 GB)
├─ Header (8 KB)
├─ Root directory
├─ Zoom 4–8 (overview, małe pliki)
├─ Zoom 9–12 (regionalne)
└─ Zoom 13–18 (szczegółowe — większość danych)
```

### 10.6 Identyfikacja „klik → działka"

**Challenge:** MapLibre renderuje kafelki MVT, ale nie ma wbudowanego „co jest pod kursorem?"

**Rozwiązania:**

1. **Query API** (Wariant B) — backend `/parcel?lat&lng` z R-tree index (sub-ms query)
2. **MapLibre `queryRenderedFeatures`** — działa, ale zwraca features z bieżącego tile'a (granice kafelka → ograniczenie)
3. **Pre-computed lookup table** — dla każdej działki zapisujemy `centroid` + `bbox`. Wrzucamy do PMTiles atrybuty + do IndexedDB bundle. Przybliżone (działa dla większości klików poza granicami).

**Rekomendacja:** opcja 1 (query API) — najdokładniejsza, tania.

### 10.7 Storage w przeglądarce

| Zasób | Rozmiar | Cache strategia |
|---|---|---|
| PMTiles | 1.5–3 GB | Workbox `CacheFirst`, browser fetchuje tylko widoczne tile'e (zazwyczaj <50 MB na sesję) |
| API responses | kilka KB per request | `StaleWhileRevalidate` |
| Dane projektu (drzewa) | użytkownika | Dexie (IndexedDB) |
| OSM base tiles | z OSM CDN | standardowy browser cache |

**Czy 1.5–3 GB PMTiles zmieści się w cache?** Chrome: do ~6% dysku per origin (zwykle kilka GB). Firefox: 50 MB per origin (za mało!). **Firefox problem** — rozwiązanie: pmtiles `Range` requests, Firefox pobiera tylko potrzebne bajty (nie cały plik).

### 10.8 Porównanie z obecnym podejściem (bez backendu)

| Aspekt | Bez backendu (ULDK + KIEG) | Self-hosted (Wariant B) |
|---|---|---|
| CORS | Ryzyko wysokie | Kontrolowany |
| Offline | Ograniczone (tylko pobrane) | Pełne |
| Koszt | €0 | ~€5/mies |
| Złożoność dev | Średnia | Wyższa (+ pipeline) |
| Aktualność danych | Real-time | Tygodniowa (zwykle OK) |
| Pokrycie | Zależy od KIEG | 100% Polski |
| Skalowalność | Limit GUGiK | Skalowalne |
| Wymagany backend | ✗ | ✓ (minimalny) |

### 10.9 Rekomendacja

**Wariant B** — optymalny balans:
- Eliminuje CORS i problem offline (główne ryzyka planu)
- Tani (~€5/mies)
- Tygodniowa synchronizacja wystarcza (EGiB nie zmienia się tak często)
- Utrzymanie proste (cron + skrypt)

**Decyzja do podjęcia:** czy jesteśmy gotowi utrzymywać minimalny backend w zamian za eliminację ryzyk CORS/offline? Jeśli nie — zostajemy przy ULDK + KIEG z fallbackami (obecny plan §6.1).

### 10.10 Legal/licensing

- EGiB: otwarte dane publiczne (ustawa Prawo geodezyjne i kartograficzne, art. 24; dyrektywa INSPIRE)
- **Warunek:** atrybucja „Dane: Główny Urząd Geodezji i Kartografii oraz Starosta [powiat]"
- Dozwolone użycie komercyjne i niekomercyjne
- Self-hosting jest wprost dozwolony (dane są jawne)
- **Brak konieczności umowy** z GUGiK

---

## 11. Otwarte pytania do rozstrzygnięcia (zaktualizowane)

- [x] **Architektura backendowa** — self-hosted (Wariant B) vs ULDK-only → **do decyzji**
- [ ] Lista 16 województw TERYT — hardkodować w aplikacji czy pobierać z innego źródła?
- [ ] Snapowanie do wierzchołków działki (`SnapToPoint`) — jako alternatywa dla strzałek 25cm?
- [ ] Poligon z chodzenia po granicy — ile punktów minimalnie? (algorytm uproszczenia?)
- [ ] Szyfrowanie lokalnej bazy — poza MVP czy od razu?
- [ ] Współrzędne w panelu drzewa — pokazywać w WGS84 i PUWG 1992 równocześnie?
- [ ] Co z działkami, dla których ULDK nie zwrócił danych (np. nowe podziały)?
- [ ] Wersjonowanie schematu Dexie (migracje) — strategia?
- [ ] Testy jednostkowe parsera WKT + klienta ULDK (mock)?
- [ ] Po dodaniu sąsiadów — czy agregować automatycznie czy zostawić jako osobne działki?
- [ ] Czy sąsiednie działki mają mieć wspólną listę gatunków i przedziałów, czy osobne?
- [ ] Ile żądań do ULDK na minutę — jaki realistyczny limit (testy wydajności)?
- [ ] Czy włączać warstwę `uzytki` (klasyfikacja gruntów) — ułatwia identyfikację lasów?
- [ ] Multi-select sąsiadów (bulk tryk) — czy dodawać do MVP?
- [ ] Czy w PMTiles trzymać też atrybuty `uzytki` (użytek gruntowy: Ls, Lz itp.)?
- [ ] Hetzner vs Cloudflare R2 + Pages Worker — preferencje hostingu?
