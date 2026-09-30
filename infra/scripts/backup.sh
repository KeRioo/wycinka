#!/usr/bin/env bash
# Backup danych runtime: SQLite (online backup API) + PMTiles (kopia pliku).
# Dodany do crona: 0 4 * * * /opt/wycinka/infra/scripts/backup.sh
# Retencja: ostatnie 7 backupów (rotacja).

set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"
RETENTION="${RETENTION:-7}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${DATA_DIR}/backups/${DATE}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] $(date -Iseconds) — starting backup -> ${BACKUP_DIR}"

# --- SQLite: online backup (bezpieczne przy działającej bazie) ---
SQLITE_FILE="${DATA_DIR}/sqlite/parcels.sqlite"
if [ -f "${SQLITE_FILE}" ]; then
	if command -v sqlite3 >/dev/null 2>&1; then
		sqlite3 "${SQLITE_FILE}" ".backup '${BACKUP_DIR}/parcels.sqlite'"
		echo "[backup] SQLite backup done ($(du -h "${BACKUP_DIR}/parcels.sqlite" | awk '{print $1}'))"
	else
		echo "[backup] WARNING: sqlite3 CLI not found, falling back to cp"
		cp "${SQLITE_FILE}" "${BACKUP_DIR}/parcels.sqlite"
	fi
else
	echo "[backup] SQLite file not found at ${SQLITE_FILE} (skipping)"
fi

# --- PMTiles: kopia pliku (duży, ale niezmienny) ---
PMTILES_FILE="${DATA_DIR}/pmtiles/dzialki.pmtiles"
if [ -f "${PMTILES_FILE}" ]; then
	cp "${PMTILES_FILE}" "${BACKUP_DIR}/dzialki.pmtiles"
	echo "[backup] PMTiles backup done ($(du -h "${BACKUP_DIR}/dzialki.pmtiles" | awk '{print $1}'))"
else
	echo "[backup] PMTiles file not found at ${PMTILES_FILE} (skipping)"
fi

# --- Manifest: metadane backupu ---
cat >"${BACKUP_DIR}/MANIFEST.json" <<EOF
{
	"created_at": "$(date -Iseconds)",
	"host": "$(hostname)",
	"contents": {
		"sqlite": $([ -f "${BACKUP_DIR}/parcels.sqlite" ] && echo "true" || echo "false"),
		"pmtiles": $([ -f "${BACKUP_DIR}/dzialki.pmtiles" ] && echo "true" || echo "false")
	}
}
EOF

# --- Rotacja: usuń starsze niż RETENTION ---
cd "${DATA_DIR}/backups"
COUNT=$(ls -1d */ 2>/dev/null | wc -l)
if [ "${COUNT}" -gt "${RETENTION}" ]; then
	ls -1dt */ | tail -n +$((RETENTION + 1)) | while read -r OLD; do
		echo "[backup] Pruning old backup: ${OLD}"
		rm -rf "${OLD}"
	done
fi

echo "[backup] Done. Backup saved to ${BACKUP_DIR}"
echo "[backup] Retention: last ${RETENTION} backups kept"