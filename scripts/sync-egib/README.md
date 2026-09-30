# egib-sync

ETL pipeline for Polish land registry (EGiB) data. Downloads GPKG files from
[geoportal.gov.pl](https://www.geoportal.gov.pl), merges them, generates PMTiles
for map rendering, and imports into SQLite for point queries.

## Quick start

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run pipeline (downloads everything)
python -m egib_sync

# Dry run (validates config, no files written)
python -m egib_sync --dry-run

# Single voivodeship (e.g. mazowieckie = 14)
python -m egib_sync --powiat 14

# Skip stages (e.g. only re-generate PMTiles from existing merged.gpkg)
python -m egib_sync --skip-download --skip-merge --skip-sqlite
```

## Stages

The pipeline runs four stages in order. Each can be skipped:

1. **download** — fetch GPKG per powiat from geoportal.gov.pl
2. **merge** — concatenate all GPKGs into one file
3. **pmtiles** — invoke `tippecanoe` to produce vector tiles
4. **sqlite** — import merged data into SQLite with R-tree spatial index

### Atomicity

Each stage writes to a `.tmp` file and renames on success. Before overwriting
existing artifacts (`merged.gpkg`, `dzialki.pmtiles`, `parcels.sqlite`), the
pipeline copies the previous version to `data/backups/{timestamp}/`. If a stage
fails, the previous on-disk state is restored from the backup. Old backups are
cleaned up per `RETENTION_BACKUPS_KEEP` (default: 2).

## Docker

```bash
docker build -t wycinka-etl .
docker run --rm -v $(pwd)/data:/app/data wycinka-etl
```

## Scheduled sync

Production sync runs weekly (Sunday 03:00) via the ETL container in
`docker-compose.yml`. To trigger manually:

```bash
docker compose exec etl python -m egib_sync --report /app/data/last-sync.json
```

## Configuration

Read from environment variables (see `.env.example`) and `.env` file. All
variables use `EGIB_*` prefix with `__` delimiter for nested settings:

```bash
EGIB_DATA_DIR=/var/lib/wycinka/data
EGIB_DOWNLOAD__CONCURRENCY=20
EGIB_PMTILES__TIPPECANOE_PATH=/usr/local/bin/tippecanoe
EGIB_SQLITE__BATCH_SIZE=5000
```

## Layout

```
data/
├── egib-raw/         # downloaded GPKG per powiat (teryt.gpkg)
├── work/             # intermediate (merged.gpkg)
├── pmtiles/
│   └── dzialki.pmtiles
├── sqlite/
│   └── parcels.sqlite
└── backups/          # timestamped rollback copies
    └── 20260930_030000/
```

## Troubleshooting

### "tippecanoe: command not found"

Install tippecanoe:

```bash
# Ubuntu / Debian
sudo apt install tippecanoe   # not in all repos — build from source:
git clone https://github.com/felt/tippecanoe.git
cd tippecanoe && make -j && sudo make install

# macOS
brew install tippecanoe

# Docker
# Already installed in the image — see Dockerfile.
```

### Timeout errors during download

Increase timeout or reduce concurrency:

```bash
python -m egib_sync --download-concurrency 5   # not yet implemented
# Or via env: EGIB_DOWNLOAD__CONCURRENCY=5
```

### Out of disk space

The full pipeline produces ~30 GB of intermediate artifacts (raw + merged).
Clean old backups manually if `retention` doesn't keep up:

```bash
rm -rf data/backups/2026092*
```

## Estimated runtime

Full sync (380 powiats): 1.5–3 hours on a modern VPS.
PMTiles generation is the bottleneck (~1.5h for all of Poland).

## License

ETL pipeline: MIT. Data: open data (GUGiK) — see [geoportal.gov.pl](https://www.geoportal.gov.pl).