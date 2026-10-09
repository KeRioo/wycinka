#!/usr/bin/env bash
# Scheduler ETL — pętla sleep-based zamiast demona crona.
# Powody: brak potrzeby roota, prosty do testowania (`bash -n`) i
# do manualnego wywołania tego samego skryptu co-dla run-once.
#
# Zmienne:
#   ETL_INTERVAL_SECONDS  co ile sekund uruchamiać sync (domyślnie 86400 = 1 dzień)
#   ETL_RUN_ONCE          "1" = wykonaj sync raz i wyjdź (używane przez `docker compose run`)
#
# Pozostałe argumenty są przekazywane do `python -m egib_sync` (np. --powiat 22).

set -u

INTERVAL="${ETL_INTERVAL_SECONDS:-86400}"

if ! [ "${INTERVAL}" -gt 0 ] 2>/dev/null; then
	echo "etl/scheduler: ETL_INTERVAL_SECONDS nie jest dodatnia liczba calkowita: '${INTERVAL}'" >&2
	exit 64
fi

step() {
	local code=0
	/usr/local/bin/run-sync.sh "$@" || code=$?
	if [ "${code}" -ne 0 ]; then
		echo "etl/scheduler: sync zakonczyl sie kodem ${code}, proba zaraz po intervalu" >&2
	else
		echo "etl/scheduler: sync OK (eval ${INTERVAL}s)" >&2
	fi
	return "${code}"
}

shutdown() {
	echo "etl/scheduler: SIGTERM/SIGINT, wychodze" >&2
	if [ -n "${SLEEP_PID:-}" ]; then
		kill "${SLEEP_PID}" 2>/dev/null || true
	fi
	exit 0
}
trap shutdown TERM INT

if [ "${ETL_RUN_ONCE:-0}" = "1" ]; then
	exec /usr/local/bin/run-sync.sh "$@"
fi

echo "etl/scheduler: start, pierwsze uruchomienie natychmiast, potem co ${INTERVAL}s" >&2

while true; do
	step "$@"
	sleep "${INTERVAL}" &
	SLEEP_PID=$!
	wait "${SLEEP_PID}"
done
