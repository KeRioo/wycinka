#!/usr/bin/env bash
# Healthcheck całego stacku — sprawdza każdy serwis.
# Użycie: ./scripts/healthcheck.sh
# Zwróci kod 0 jeśli wszystko OK, !=0 jeśli cokolwiek padło.

set -uo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
API_PORT="${API_PORT:-8000}"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

failures=0

check_http() {
	local name="$1"
	local url="$2"
	local expected="${3:-200}"

	local code
	code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "${url}" || echo "000")

	if [ "$code" = "$expected" ]; then
		echo "${GREEN}[OK]${NC}   ${name} (${url}) -> ${code}"
	else
		echo "${RED}[FAIL]${NC} ${name} (${url}) -> ${code} (expected ${expected})"
		failures=$((failures + 1))
	fi
}

echo "=== wycinka stack healthcheck ==="
echo "Compose: ${COMPOSE_FILE}"
echo

# 1. Kontenery — czy w ogóle żyją?
echo "--- containers ---"
for svc in api web caddy cloudflared; do
	if docker compose -f "${COMPOSE_FILE}" ps --services --status running 2>/dev/null | grep -q "^${svc}$"; then
		echo "${GREEN}[OK]${NC}   container ${svc} is running"
	else
		echo "${RED}[FAIL]${NC} container ${svc} is NOT running"
		failures=$((failures + 1))
	fi
done
echo

# 2. Healthcheck bezpośrednio do api (port wystawiony tylko w dev)
echo "--- API ---"
check_http "api /health" "http://localhost:${API_PORT}/health"
check_http "api /api/v1/version" "http://localhost:${API_PORT}/api/v1/version"
echo

# 3. Caddy (port 80/443 na prod, 80 w dev)
echo "--- Caddy (public entry) ---"
check_http "caddy /health" "http://localhost/health"
check_http "caddy /api/v1/version" "http://localhost/api/v1/version"
check_http "caddy / (web SPA)" "http://localhost/"
echo

# 4. PMTiles — sprawdź nagłówki Range + Content-Type
echo "--- PMTiles ---"
headers=$(curl -sk -I --max-time 5 "http://localhost/api/v1/pmtiles/dzialki" || true)
if echo "${headers}" | grep -qi 'accept-ranges: bytes'; then
	echo "${GREEN}[OK]${NC}   PMTiles supports Range requests"
else
	echo "${YELLOW}[WARN]${NC} PMTiles may not support Range — needed for tiles"
	failures=$((failures + 1))
fi
echo

echo "=== summary ==="
if [ "${failures}" -eq 0 ]; then
	echo "${GREEN}All checks passed.${NC}"
	exit 0
else
	echo "${RED}${failures} check(s) failed.${NC}"
	exit 1
fi