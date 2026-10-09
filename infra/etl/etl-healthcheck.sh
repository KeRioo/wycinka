#!/usr/bin/env bash
# HEALTHCHECK kontenera etl.
# OK gdy: istnieje marker ostatniego udanego sync i nie jest starszy
# niz 2x interval (zapasy na przerwe w codziennym uruchomieniu).

set -u

DATA_DIR="${EGIB_DATA_DIR:-/app/data}"
OPS_DIR="${DATA_DIR}/.sync-ops"
MARKER="${OPS_DIR}/last-success"
INTERVAL="${ETL_INTERVAL_SECONDS:-86400}"

if ! [ -f "${MARKER}" ]; then
	echo "healthcheck: brak markera ${MARKER} — sync jeszcze nie ukonczyl sie sukcesem" >&2
	exit 1
fi

now=$(date +%s)
mtime=$(stat -c %Y "${MARKER}" 2>/dev/null) || exit 1
age=$((now - mtime))
max_age=$((2 * INTERVAL))

if [ "${age}" -gt "${max_age}" ]; then
	echo "healthcheck: marker ma ${age}s, max ${max_age}s — sync jest zalegly" >&2
	exit 1
fi

echo "healthcheck: ostatni udany sync ${age}s temu (limit ${max_age}s)"
