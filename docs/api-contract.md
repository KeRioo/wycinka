# Kontrakt API — wycinka.app

> **NIEZMIENNIALNY.** Zmiany tylko przez nadzorcę (po uzgodnieniu z zespołem).
>
> Backend implementuje. Frontend konsumuje. Oba działają równolegle zgodnie z tym dokumentem.

## Konwencje

- **Bazowy URL:** `/api/v1` (dev: `http://localhost:8000/api/v1`)
- **Format:** JSON dla wszystkich odpowiedzi, `image/png` dla map
- **CORS:** `Access-Control-Allow-Origin: *` (produkcyjnie ograniczyć do domeny)
- **Błędy:** zawsze `{ "error": "...", "code": "...", "details": {} }`
- **Daty:** ISO 8601 (`2026-09-30T12:00:00Z`)
- **CRS:** `lat`/`lng` = WGS84 (EPSG:4326)

---

## 1. Health & meta

### `GET /health`

```http
200 OK
{
  "status": "ok",            // "ok" | "degraded" | "down"
  "version": "1.0.0",
  "uptime_seconds": 3600,
  "db_loaded": true,
  "pmtiles_loaded": true,
  "data_freshness": "2026-09-29T03:00:00Z"
}
```

### `GET /api/v1/version`

```http
200 OK
{
  "api": "1.0.0",
  "data": "2026-09-29",      // data ostatniego ETL sync
  "egib_source": "geoportal.gov.pl",
  "etag": "abc123..."        // hash pliku PMTiles (do cache invalidation)
}
```

---

## 2. Działki (parcels)

### `GET /api/v1/parcel?lat={lat}&lng={lng}`

Zwraca działkę, w której obrysie znajduje się punkt.

**Query params:**
- `lat` (float, wymagany): -90 do 90
- `lng` (float, wymagany): -180 do 180

**Odpowiedź (znaleziono):**
```http
200 OK
{
  "found": true,
  "parcel": {
    "id": "141201_1.0001.6509",
    "teryt": "141201_1.0001.6509",
    "number": "6509",
    "voivodeship": "mazowieckie",
    "voivodeship_code": "14",
    "county": "Warszawa",
    "county_code": "1201",
    "commune": "Śródmieście",
    "commune_code": "141201",
    "region": "0001",
    "region_name": "Obręb 0001",
    "area_m2": 1234.56,
    "land_use": "Ls",                  // kod użytku, opcjonalnie
    "geom": {
      "type": "Polygon",
      "coordinates": [[[lng, lat], ...]]
    },
    "bbox": [min_lng, min_lat, max_lng, max_lat],
    "centroid": [lng, lat],
    "fetched_at": "2026-09-29T03:00:00Z",
    "datasource": "geoportal.gov.pl"
  }
}
```

**Odpowiedź (nie znaleziono):**
```http
200 OK
{
  "found": false,
  "nearby_parcels": []                // zawsze pusty w obecnej wersji (TODO)
}
```

**Błędy:**
- `400`: `lat`/`lng` poza zakresem (FastAPI `Query(ge=-90, le=90)`)
- `503`: baza niedostępna (gdy plik SQLite nie istnieje lub R-tree nie działa)

### `GET /api/v1/parcel/{teryt}`

Zwraca działkę po identyfikatorze TERYT.

**Path param:**
- `teryt`: format `WWPPGG_R.OOOO.NR_DZ`, regex `^\d{6}_[1-5]\.\d{4}\.[0-9A-Za-z/\-.]+$`
- Przykład: `141201_1.0001.6509`

**Odpowiedź (znaleziono):**
```http
200 OK
{
  "parcel": { ... }                  // ten sam Parcel co wyżej, BEZ envelope { found, parcel }
}
```

**Błędy:**
- `422 INVALID_TERYT`: TERYT nie pasuje do regex
- `404 PARCEL_NOT_FOUND`: działka o podanym TERYT nie istnieje
- `503 DB_UNAVAILABLE`: baza niedostępna

### `GET /api/v1/parcel/aggregate?id={id1,id2,...}`

Łączy geometrie sąsiednich działek w jeden poligon (lub MULTIPOLYGON).

**Query params:**
- `id` (string, wymagany): ID TERYT, max 20

**Odpowiedź:**
```http
200 OK
{
  "type": "Polygon",                   // lub "MultiPolygon"
  "coordinates": [...],
  "bbox": [...],
  "area_m2": 12345.67,
  "parcels": ["141201_1.0001.6509", "141201_1.0001.6510"]
}
```

---

## 3. Wyszukiwarka

### `GET /api/v1/search?q={query}&limit={n}`

**Query params:**
- `q` (string, wymagany): TERYT lub `nazwa_obrębu numer`
- `limit` (int, optional, default=10, max=50)

**Odpowiedź:**
```http
200 OK
{
  "results": [
    {
      "id": "141201_1.0001.6509",
      "teryt": "141201_1.0001.6509",
      "label": "141201_1.0001.6509 — Obręb 0001, Warszawa",
      "score": 0.95                      // opcjonalnie
    }
  ],
  "total": 1
}
```

Wyszukiwanie:
- Po TERYT — prefiks (np. `1412` → wszystkie zaczynające się od `1412`)
- Po `nazwa nr` — tylko jeśli q zawiera spację

---

## 4. PMTiles (warstwa mapy)

### `GET /api/v1/pmtiles/dzialki`

Zwraca binarny plik PMTiles z granicami działek.

**Response:**
- `200 OK` (lub `206 Partial Content` dla Range request)
- `Content-Type: application/octet-stream`
- `Content-Length: {size}`
- `Access-Control-Allow-Origin: *`
- `Accept-Ranges: bytes`
- `ETag: "abc123"`
- `Cache-Control: public, max-age=3600`

**Range requests (HTTP 206):**
- Header klienta: `Range: bytes=0-1023`
- Odpowiedź: `206 Partial Content` + `Content-Range: bytes 0-1023/{size}` + bajty

**Klient (MapLibre):**
```ts
import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      dzialki: {
        type: 'vector',
        url: 'pmtiles://https://wycinka.app/api/v1/pmtiles/dzialki',
      },
    },
    layers: [
      {
        id: 'dzialki-fill',
        type: 'fill',
        source: 'dzialki',
        'source-layer': 'dzialki',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.2,
          'fill-outline-color': '#15803d',
        },
      },
    ],
  },
});
```

---

## 5. Kody błędów (jednolite dla wszystkich endpointów)

```json
{
  "error": "Parcel not found at given coordinates",
  "code": "PARCEL_NOT_FOUND",
  "details": {
    "lat": 52.2297,
    "lng": 21.0122
  }
}
```

| HTTP | Code | Znaczenie | Które endpointy |
|---|---|---|---|
| 400 | `BAD_REQUEST` | Walidacja parametrów (np. za dużo ID) | `/parcel`, `/parcel/aggregate`, `/search` |
| 404 | `PARCEL_NOT_FOUND` | Działka nie istnieje dla podanego TERYT | `/parcel/{teryt}`, `/parcel/aggregate` |
| 416 | `BAD_REQUEST` | Range header nieparsowalny | `/pmtiles/dzialki` |
| 422 | `INVALID_TERYT` | TERYT nie pasuje do regex | `/parcel/{teryt}`, `/parcel/aggregate` |
| 429 | `RATE_LIMITED` | Przekroczono rate limit | (konfigurowane w reverse proxy) |
| 500 | `INTERNAL_ERROR` | Nieoczekiwany błąd | wszystkie |
| 503 | `DB_UNAVAILABLE` | Baza SQLite nie istnieje lub błąd | wszystkie |
| 503 | `PMTILES_UNAVAILABLE` | Plik PMTiles nie istnieje lub ma 0 bajtów | `/pmtiles/dzialki` |
| 504 | `GATEWAY_TIMEOUT` | Timeout upstream | (reverse proxy) |

---

## 6. Limity i rate limiting

- **Max 60 req/s per IP** (zwraca `429 Too Many Requests`)
- **Max 100 000 punktów** w jednym `aggregate`
- **Timeout:** 5s na zapytanie (zwraca `504 Gateway Timeout`)
- **Max q length:** 256 znaków

---

## 7. Wersjonowanie

- URL path: `/api/v1` (breaking changes = `/api/v2`)
- Header: `API-Version` (opcjonalnie, klient może sprawdzić)

---

## 8. Uwagi implementacyjne

- **`/parcel?lat&lng` zwraca 200 + `{"found": false}`** — nawet gdy nic nie znaleziono. Jest to flow „interactive map", więc brak wyniku nie jest błędem.
- **`/parcel/{teryt}` zwraca 404** gdy działka nie istnieje — TERYT jest identyfikatorem, więc brak jest błędem.
- **CORS:** backend ustawia `Access-Control-Allow-Origin` z `cors_allow_origins` (domyślnie `*`). W produkcji ustawić na konkretną domenę.
- **Range requests dla PMTiles:** backend honoruje `Range: bytes=START-END`, `Range: bytes=START-`, `Range: bytes=-SUFFIX`. Zwraca `416` dla nieparsowalnego lub niespełnialnego range.
- **ETag dla PMTiles:** hash pliku (mtime + size). Frontend może używać `If-None-Match` do warunkowego cache'owania.

## 9. Przykłady curl

```bash
# Health
curl http://localhost:8000/health

# Działka po współrzędnych (Pałac Kultury, Warszawa)
curl "http://localhost:8000/api/v1/parcel?lat=52.2317&lng=21.0061"

# Działka po TERYT
curl http://localhost:8000/api/v1/parcel/141201_1.0001.6509

# Wyszukiwanie
curl "http://localhost:8000/api/v1/search?q=141201"

# Agregacja
curl "http://localhost:8000/api/v1/parcel/aggregate?id=141201_1.0001.6509,141201_1.0001.6510"

# PMTiles (pierwszy MB)
curl -H "Range: bytes=0-1048576" http://localhost:8000/api/v1/pmtiles/dzialki -o partial.pmtiles
```
