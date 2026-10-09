# wycinka.app — backend (FastAPI)

FastAPI backend for [wycinka.app](../..). Hosts the EGiB parcel dataset
(SQLite + R-tree) and the PMTiles archive, exposing a JSON + binary API
documented in [`docs/api-contract.md`](../../docs/api-contract.md).

## Requirements

- Python **3.12+** (developed against 3.12.10; 3.13/3.14 also work)
- SQLite with the **R-tree** extension (ships in the stdlib)
- The bundled ETL pipeline ([`scripts/sync-egib`](../../../scripts/sync-egib))
  produces `data/parcels.sqlite` and `data/pmtiles/dzialki.pmtiles`.

## Local development

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\pip install -e ".[dev]"

# Generate the sample SQLite fixture used by the test suite
.venv\Scripts\python tests\fixtures\generate_sample.py

# Run the test suite with coverage
.venv\Scripts\pytest --cov=app --cov-report=term-missing

# Lint and format
.venv\Scripts\ruff check .
.venv\Scripts\ruff format .
.venv\Scripts\mypy app
```

### Run the dev server

```bash
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

The API is then reachable at `http://localhost:8000`. Interactive docs:
`http://localhost:8000/docs`.

## Docker

```bash
cd apps/api
docker build -t wycinka-api .
docker run --rm -p 8000:8000 \
  -v "$PWD/data:/app/data" \
  -e WYCINKA_DB_PATH=/app/data/parcels.sqlite \
  -e WYCINKA_PMTILES_PATH=/app/data/pmtiles/dzialki.pmtiles \
  wycinka-api
```

The image is `python:3.12-slim` based, multi-stage built, runs as the
non-root user `appuser`, and exposes a `/health` healthcheck.

## Configuration

All settings are loaded from environment variables (with the
`WYCINKA_` prefix) — see `app/core/config.py` for the full schema.

| Variable | Default | Notes |
| --- | --- | --- |
| `WYCINKA_API_VERSION` | `1.0.0` | Reported by `/api/v1/version` |
| `WYCINKA_DEBUG` | `false` | Enable pretty (non-JSON) logs |
| `WYCINKA_DB_PATH` | `data/parcels.sqlite` | Path to the SQLite + R-tree database |
| `WYCINKA_PMTILES_PATH` | `data/pmtiles/dzialki.pmtiles` | Path to the PMTiles archive |
| `WYCINKA_CORS_ALLOW_ORIGINS` | `*` | Comma-separated list (use specific origins in prod) |
| `WYCINKA_MAX_PARCELS_IN_AGGREGATE` | `20` | Hard cap on `/parcel/aggregate` ids |
| `WYCINKA_MAX_SEARCH_LIMIT` | `50` | Hard cap on `/search?limit=` |
| `WYCINKA_MAX_SEARCH_QUERY_LENGTH` | `256` | Hard cap on `/search?q=` |

You can drop a `.env` file into `apps/api/` to set these in development
(`pydantic-settings` will pick it up automatically).

## API endpoints

All endpoints under `/api/v1/*` are documented in
[`docs/api-contract.md`](../../docs/api-contract.md):

| Endpoint | Notes |
| --- | --- |
| `GET /health` | Liveness/readiness probe |
| `GET /api/v1/version` | API version + ETL date + PMTiles ETag |
| `GET /api/v1/parcel?lat&lng` | Point → parcel lookup |
| `GET /api/v1/parcel/{teryt}` | TERYT lookup |
| `GET /api/v1/parcel/aggregate?id=...` | Combine up to 20 parcels |
| `GET /api/v1/search?q=&limit=` | TERYT prefix search |
| `GET /api/v1/pmtiles/dzialki` | PMTiles binary with HTTP Range support |
| `OPTIONS /api/v1/pmtiles/dzialki` | CORS preflight for the PMTiles URL |
| `POST /api/v1/sync/trigger` | Start the EGiB sync pipeline in the background |
| `GET /api/v1/sync/status` | Status of the last (or current) sync run |

`/api/v1/sync/*` is not part of `docs/api-contract.md` yet — see the
§Database migrations section for how the sync command is configured.

## Database migrations

Schema lives in `app/core/db.py` (used at runtime by `Database.init_schema`)
and is mirrored by Alembic migrations in `migrations/`. The initial
migration (`0001_initial_schema`) applies `parcels`, the R-tree tables with
their triggers, and `sync_meta` on an empty SQLite database.

```bash
# upgrade a database (path from alembic.ini → sqlalchemy.url),
# or override per invocation:
WYCINKA_DB_URL=sqlite:///data/parcels.sqlite alembic upgrade head

# start from scratch:
WYCINKA_DB_URL=sqlite:////tmp/empty.sqlite alembic upgrade head
alembic downgrade base
```

## Sync pipeline (EGiB)

The backend does not implement the import itself — it runs the ETL
package (`scripts/sync-egib`) as an external command:

```bash
# configure (env or .env):
WYCINKA_SYNC_COMMAND="python -m egib_sync full"
```

- `POST /api/v1/sync/trigger` spawns the command in the background and
  returns `202 Accepted`. Alt-code `409 SYNC_ALREADY_RUNNING` if one is
  already running, `400 SYNC_NOT_CONFIGURED` if no command is set.
- `GET /api/v1/sync/status` reports `running` / `success` / `error` /
  `unknown` with timestamps from `sync_meta` (`503` if the DB is
  unavailable).
- In production logs go to `wycinka.log` (JSON, one record per line);
  in dev (`WYCINKA_DEBUG=1`) pretty logs stay on stdout.

### Example curl

```bash
# Health
curl http://localhost:8000/health

# Parcel at Pałac Kultury (Warszawa)
curl "http://localhost:8000/api/v1/parcel?lat=52.2317&lng=21.0061"

# Parcel by TERYT
curl http://localhost:8000/api/v1/parcel/141201_1.0001.6509

# Search by prefix
curl "http://localhost:8000/api/v1/search?q=141201_1.0001.650"

# Aggregate
curl "http://localhost:8000/api/v1/parcel/aggregate?id=141201_1.0001.6509,141201_1.0001.6510"

# First MB of the PMTiles archive
curl -H "Range: bytes=0-1048576" http://localhost:8000/api/v1/pmtiles/dzialki -o partial.pmtiles
```

## Project layout

```
apps/api/
├── Dockerfile                  multi-stage, python:3.12-slim, non-root
├── pyproject.toml              deps + ruff/mypy/pytest config
├── README.md                   this file
├── app/
│   ├── main.py                 FastAPI app factory + lifespan + exception handlers
│   ├── core/
│   │   ├── config.py           pydantic-settings (env-driven)
│   │   ├── db.py               aiosqlite + schema + R-tree triggers
│   │   └── logging.py          structlog JSON
│   ├── api/
│   │   ├── health.py           /health, /api/v1/version
│   │   ├── parcels.py          /parcel, /parcel/{teryt}, /parcel/aggregate
│   │   ├── search.py           /search
│   │   └── pmtiles.py          /pmtiles/dzialki (with HTTP Range)
│   ├── models/parcel.py        Pydantic response models
│   └── services/
│       ├── wkt_parser.py       standalone WKT parser
│       └── parcel_service.py   SQL queries + geometry handling
└── tests/
    ├── conftest.py             fixtures: sample DB, sample PMTiles, httpx client
    ├── test_health.py
    ├── test_parcels.py
    ├── test_aggregate.py
    ├── test_search.py
    ├── test_pmtiles.py
    ├── test_wkt_parser.py
    ├── test_wkt_parser_property.py
    └── fixtures/
        ├── generate_sample.py  regenerates parcels_sample.sqlite
        └── parcels_sample.sqlite (committed; ~70 KB)
```

## Adding a new endpoint

1. Decide where it belongs: `app/api/health.py`, `parcels.py`,
   `search.py`, or create a new module under `app/api/`.
2. Add a Pydantic response model under `app/models/parcel.py` (or a new
   module under `app/models/`) — keep `extra="forbid"` so the API contract
   stays stable.
3. Wire the router in `app/api/__init__.py`. Don't forget the APIRouter
   `prefix` if the endpoint lives under `/api/v1`.
4. Implement the business logic in `app/services/`; the API layer
   should be thin and only handle HTTP concerns (validation, error
   mapping, status codes).
5. Add tests under `tests/` covering happy path + at least two error
   cases. Run `pytest --cov=app --cov-report=term-missing` and keep
   coverage at or above 80%.
6. If the endpoint is part of the public contract, mention it in
   `docs/api-contract.md` (the supervisor owns that file).

## License

MIT. Data served by this API is sourced from EGiB and must be attributed
to "Główny Urząd Geodezji i Kartografii oraz Starosta [powiat]".