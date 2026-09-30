# Schemat bazy danych — wycinka.app

> Dokumentacja struktury SQLite i źródeł danych. Backend i ETL współdzielą ten schemat.

## SQLite (backend — `apps/api/data/parcels.sqlite`)

### Tabela `parcels`

Główna tabela z geometrią działek (źródło: ETL z EGiB).

```sql
CREATE TABLE parcels (
  id TEXT PRIMARY KEY,                -- TERYT, np. "141201_1.0001.6509"
  teryt TEXT NOT NULL UNIQUE,        -- alias na id, dla czytelności
  number TEXT NOT NULL,               -- numer działki ("6509")
  voivodeship TEXT NOT NULL,          -- nazwa ("mazowieckie")
  voivodeship_code TEXT NOT NULL,     -- kod 2-cyfrowy ("14")
  county TEXT NOT NULL,               -- nazwa powiatu ("Warszawa")
  county_code TEXT NOT NULL,          -- kod powiatu 4-cyfrowy ("1201")
  commune TEXT NOT NULL,              -- nazwa gminy
  commune_code TEXT NOT NULL,         -- 6-cyfrowy kod gminy
  region TEXT NOT NULL,               -- obręb ("0001")
  region_name TEXT,                   -- nazwa obrębu
  area_m2 REAL NOT NULL,              -- powierzchnia
  land_use TEXT,                      -- kod użytku ("Ls")
  geom_wkt TEXT NOT NULL,             -- geometria w WKT (EPSG:4326)
  centroid_lng REAL NOT NULL,
  centroid_lat REAL NOT NULL,
  bbox_min_lng REAL NOT NULL,
  bbox_min_lat REAL NOT NULL,
  bbox_max_lng REAL NOT NULL,
  bbox_max_lat REAL NOT NULL,
  fetched_at TEXT NOT NULL,           -- ISO 8601, kiedy ETL pobrał
  datasource TEXT NOT NULL            -- źródło ("geoportal.gov.pl")
);

CREATE INDEX idx_parcels_teryt ON parcels(teryt);
CREATE INDEX idx_parcels_voivodeship ON parcels(voivodeship_code);
CREATE INDEX idx_parcels_county ON parcels(county_code);
CREATE INDEX idx_parcels_commune ON parcels(commune_code);
CREATE INDEX idx_parcels_number ON parcels(number);
```

### R-tree (indeks przestrzenny)

```sql
CREATE VIRTUAL TABLE parcels_rtree USING rtree(
  id,
  min_lng, max_lng,
  min_lat, max_lat
);

-- Trigger synchronizujący
CREATE TRIGGER parcels_rtree_insert AFTER INSERT ON parcels
BEGIN
  INSERT INTO parcels_rtree VALUES (
    NEW.id, NEW.bbox_min_lng, NEW.bbox_max_lng, NEW.bbox_min_lat, NEW.bbox_max_lat
  );
END;

CREATE TRIGGER parcels_rtree_delete AFTER DELETE ON parcels
BEGIN
  DELETE FROM parcels_rtree WHERE id = OLD.id;
END;
```

**Query "co jest w punkcie (X, Y)?"** (po R-tree):
```sql
SELECT p.* FROM parcels p
JOIN parcels_rtree r ON p.id = r.id
WHERE r.min_lng <= ? AND r.max_lng >= ?
  AND r.min_lat <= ? AND r.max_lat >= ?
  -- dokładne sprawdzenie point-in-polygon w Pythonie (Turf.js / shapely)
LIMIT 1;
```

### Tabela `sync_meta`

```sql
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Przykładowe wpisy:
INSERT INTO sync_meta VALUES ('last_sync', '2026-09-29T03:00:00Z', '...');
INSERT INTO sync_meta VALUES ('parcels_count', '35000000', '...');
INSERT INTO sync_meta VALUES ('egib_etag', 'abc123', '...');
INSERT INTO sync_meta VALUES ('pmtiles_path', '/data/pmtiles/dzialki.pmtiles', '...');
```

---

## PMTiles (`apps/api/data/pmtiles/dzialki.pmtiles`)

Single-file z wszystkimi działkami w formacie MVT (vector tiles).

**Struktura:**
- **Warstwa:** `dzialki`
- **Atrybuty w tile:**
  - `id` (TERYT)
  - `number`
  - `area_m2`
  - `land_use`
  - `voivodeship`
  - `county`
- **Zoom:** 4–18 (zoom 4–12 overview, 13–18 szczegółowe)
- **Rozmiar:** ~1.5–3 GB dla całej Polski
- **Generacja:** `tippecanoe` (ETL)

---

## ETL intermediate (`scripts/sync-egib/work/`)

Przejściowe pliki podczas sync (w `data/`, niecommitowane):

```
data/egib-raw/
  └── {powiat_teryt}.gpkg           # pobrane z geoportal.gov.pl

data/work/
  ├── merged.gpkg                   # po konkatenacji
  ├── poland.pmtiles                # po tippecanoe
  └── parcels.sqlite                # finalna baza dla API
```

---

## Migracje

Alembic niepotrzebne (SQLite bez migracji dla developmentu). Dla produkcji:
- **Prosta strategia:** pełny reload bazy przy każdym sync (akceptowalne — sync co tydzień)
- **Backup:** stary plik SQLite kopiowany do `data/backups/yyyymmdd/parcels.sqlite` przed nadpisaniem

---

## Rozmiar

| Element | Rozmiar |
|---|---|
| SQLite z wszystkimi działkami | ~10–15 GB |
| PMTiles (z atrybutami) | ~1.5–3 GB |
| Raw GPKG per powiat | ~50–300 MB |
| Raw GPKG (cała PL) | ~10–15 GB |
| Łącznie ETL artifacts | ~30 GB (po każdym sync) |

**Storage policy:** zachowujemy ostatni sync + poprzedni (do rollbacku). Cleanup starszych.
