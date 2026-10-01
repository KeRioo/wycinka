# Schemat bazy danych — wycinka.app

> Dokumentacja struktury SQLite i źródeł danych. Backend (`apps/api/`) i ETL (`scripts/sync-egib/`) współdzielą ten schemat. **Zsynchronizowane z implementacją (commit na `feat/backend-scaffold` + `feat/etl-scaffold`).**

## SQLite (backend + ETL — `data/sqlite/parcels.sqlite`)

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
  region_name TEXT,                   -- nazwa obrębu (NULL gdy brak w EGiB)
  area_m2 REAL NOT NULL,              -- powierzchnia
  land_use TEXT,                      -- kod użytku ("Ls"), opcjonalny
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

SQLite R-tree wymaga INTEGER primary key w pierwszej kolumnie. Ponieważ `id` w tabeli `parcels` jest TEXT (TERYT), używamy tabeli mapującej.

```sql
CREATE TABLE parcels_rtree_map (
  parcel_id TEXT NOT NULL UNIQUE,     -- TEXT TERYT
  rtree_id INTEGER NOT NULL UNIQUE    -- auto-increment INTEGER (rtree PK)
);

CREATE INDEX idx_parcels_rtree_map_parcel
  ON parcels_rtree_map(parcel_id);

CREATE VIRTUAL TABLE parcels_rtree USING rtree(
  id INTEGER PRIMARY KEY,             -- SQLite R-tree auto-uses INTEGER rowid
  min_lng, max_lng,
  min_lat, max_lat
);
```

**Triggery synchronizujące** (używane przez backend w `apps/api/app/core/db.py`):

```sql
CREATE TRIGGER parcels_rtree_insert AFTER INSERT ON parcels
BEGIN
  INSERT INTO parcels_rtree (min_lng, max_lng, min_lat, max_lat)
  VALUES (
    NEW.bbox_min_lng, NEW.bbox_max_lng, NEW.bbox_min_lat, NEW.bbox_max_lat
  );
  INSERT INTO parcels_rtree_map (parcel_id, rtree_id)
  VALUES (NEW.id, last_insert_rowid());
END;

CREATE TRIGGER parcels_rtree_delete AFTER DELETE ON parcels
BEGIN
  DELETE FROM parcels_rtree_map WHERE parcel_id = OLD.id;
  DELETE FROM parcels_rtree WHERE id = (
    SELECT rtree_id FROM parcels_rtree_map WHERE parcel_id = OLD.id
  );
END;
```

> **Uwaga:** ETL (`scripts/sync-egib/egib_sync/sqlite_loader.py`) **nie używa triggerów** — przy resecie bazy najpierw buduje R-tree jawnie (w batch), a potem wstawia do `parcels`. Backend używa triggerów do utrzymywania synchronizacji przy runtime (np. ewentualne ręczne update'y). Oba podejścia są równoważne, triggerów nie używa się jednocześnie.

**Query „co jest w punkcie (X, Y)?"** (R-tree bbox filter + exact pip):

```sql
SELECT p.* FROM parcels p
JOIN parcels_rtree_map m ON m.parcel_id = p.id
JOIN parcels_rtree r ON r.id = m.rtree_id
WHERE r.min_lng <= ? AND r.max_lng >= ?
  AND r.min_lat <= ? AND r.max_lat >= ?
ORDER BY p.area_m2 ASC;
-- dokładne sprawdzenie point-in-polygon w Pythonie (shapely / wkt_parser)
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

### Tabela `schema_meta` (dodana przez ETL)

```sql
CREATE TABLE schema_meta (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Przykładowe wpisy:
INSERT INTO schema_meta VALUES (1, '2026-09-29T03:00:00Z');
```

ETL używa tej tabeli do śledzenia wersji schematu. Backend jej nie używa (ignoruje nieznane tabele). Nie ma to wpływu na kompatybilność.

---

## PMTiles (`data/pmtiles/dzialki.pmtiles`)

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
- **Serwowanie:** backend `/api/v1/pmtiles/dzialki` z HTTP Range support

---

## ETL intermediate (`data/`)

Pliki przejściowe podczas sync (w `data/`, niecommitowane):

```
data/egib-raw/
  └── {powiat_teryt}.gpkg           # pobrane z geoportal.gov.pl

data/work/
  ├── merged.gpkg                   # po konkatenacji
  ├── poland.pmtiles                # po tippecanoe
  └── parcels.sqlite                # finalna baza dla API

data/pmtiles/
  └── dzialki.pmtiles               # finalny PMTiles (używany przez API)

data/sqlite/
  └── parcels.sqlite                # finalna baza SQLite (używana przez API)

data/backups/
  └── {timestamp}/                  # rollback directory (zachowuje poprzednią wersję artifacts)
```

---

## Ścieżki w runtime

| Kontekst | `db_path` | `pmtiles_path` |
|---|---|---|
| **Dev (local)** | `apps/api/data/parcels.sqlite` | `apps/api/data/pmtiles/dzialki.pmtiles` |
| **Docker (api container)** | `/app/data/sqlite/parcels.sqlite` | `/app/data/pmtiles/dzialki.pmtiles` |
| **ETL standalone** | `data/sqlite/parcels.sqlite` | `data/pmtiles/dzialki.pmtiles` |

**W Docker Compose:** volume `api-data` zamontowany w `api` jako `/app/data`. ETL w trybie standalone zapisuje do `./data/`. Aby oba widziały te same pliki, ETL musi pisać do tego samego volume (`docker run -v wycinka_api-data:/app/data wycinka-etl`).

---

## Migracje

Alembic niepotrzebne (SQLite bez migracji dla developmentu). Dla produkcji:
- **Prosta strategia:** pełny reload bazy przy każdym sync (akceptowalne — sync co tydzień)
- **Backup:** przed nadpisaniem `parcels.sqlite` i `dzialki.pmtiles` kopie do `data/backups/{timestamp}/`
- **Rollback:** jeśli któryś etap pipeline padnie, `_fail_with_partial()` w `pipeline.py` przywraca z backupu
- **Retencja:** `RETENTION_BACKUPS_KEEP=2` (zachowuje ostatnie 2 backupy)

**Jeśli kiedyś potrzebna będzie migracja in-place:**
1. ETL zapisuje nową wersję do `parcels_v2.sqlite`
2. Backend obsługuje obie wersje (feature flag)
3. Po potwierdzeniu — rename `v2` → główny plik

---

## Rozmiar

| Element | Rozmiar |
|---|---|
| SQLite z wszystkimi działkami | ~10–15 GB |
| PMTiles (z atrybutami) | ~1.5–3 GB |
| Raw GPKG per powiat | ~50–300 MB |
| Raw GPKG (cała PL) | ~10–15 GB |
| Łącznie ETL artifacts | ~30 GB (po każdym sync) |

**Storage policy:** zachowujemy ostatni sync + poprzedni (do rollbacku). Cleanup starszych przez `RETENTION_BACKUPS_KEEP`.
