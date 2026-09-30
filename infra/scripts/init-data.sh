#!/usr/bin/env bash
# Inicjalizacja katalogów runtime dla danych ETL + backupów.
# Wywoływany raz po pierwszym `docker compose up` (lub ręcznie).
# Idempotentny — bezpiecznie uruchamiać wielokrotnie.

set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"

mkdir -p "${DATA_DIR}/pmtiles"
mkdir -p "${DATA_DIR}/sqlite"
mkdir -p "${DATA_DIR}/backups"
mkdir -p "${DATA_DIR}/etl-staging"

echo "[init-data] Data directories initialized in ${DATA_DIR}"
echo "[init-data] Layout:"
echo "  ${DATA_DIR}/pmtiles       # pliki PMTiles (1.5-3 GB)"
echo "  ${DATA_DIR}/sqlite        # baza SQLite z R-tree"
echo "  ${DATA_DIR}/backups       # rotacyjne backupy (retention 7 dni)"
echo "  ${DATA_DIR}/etl-staging   # tymczasowe pliki ETL"