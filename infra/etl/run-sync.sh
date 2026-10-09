#!/usr/bin/env bash
# Pojedyncze uruchomienie pipeline ETL + zapis statusu do wolumenu danych.
# Sleep-scheduler wywoluje go w petli; operator tez moze uzyc przez
# `docker compose run --rm etl /usr/local/bin/run-sync.sh --powiat 14`.
#
# Statusy (slużą healthcheckowi i runbookowi):
#   data/.sync-ops/last-success      — dotykany po udanym sync
#   data/.sync-ops/last-failure      — dotykany po nieudanym sync
#   data/.sync-ops/last-report-*.json — raport JSON z pipeline, rotacja ETL_REPORT_KEEP

set -u

DATA_DIR="${EGIB_DATA_DIR:-/app/data}"
OPS_DIR="${DATA_DIR}/.sync-ops"
REPORT_KEEP="${ETL_REPORT_KEEP:-5}"

mkdir -p "${OPS_DIR}"

if ! command -v tippecanoe >/dev/null 2>&1; then
	echo "etl/run-sync: tippecanoe nie znaleziony w PATH" >&2
	exit 70
fi

REPORT="${OPS_DIR}/last-report-$(date -u +%Y%m%dT%H%M%SZ).json"

echo "etl/run-sync: start $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2

exit_code=0
python -m egib_sync --report "${REPORT}" "$@" || exit_code=$?

if [ "${exit_code}" -eq 0 ]; then
	date -u +%Y-%m-%dT%H:%M:%SZ > "${OPS_DIR}/last-success"
	rm -f "${OPS_DIR}/last-failure"
else
	date -u +%Y-%m-%dT%H:%M:%SZ > "${OPS_DIR}/last-failure"
	echo "etl/run-sync: pipeline zakonczyl sie kodem ${exit_code}" >&2
fi

# Rotacja raportów: zostaw ${REPORT_KEEP} najnowszych
while [ "$(ls -1 "${OPS_DIR}/last-report"-*.json 2>/dev/null | wc -l)" -gt "${REPORT_KEEP}" ]; do
	oldest="$(ls -1tr "${OPS_DIR}/last-report"-*.json 2>/dev/null | head -n1)"
	[ -n "${oldest}" ] || break
	rm -f "${oldest}"
done

exit "${exit_code}"
