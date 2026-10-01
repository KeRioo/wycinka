#!/usr/bin/env bash
set -euo pipefail

if command -v tippecanoe >/dev/null 2>&1; then
    exec tippecanoe --version >/dev/null
fi

if [ ! -x "${TIPPECANOE_PATH:-/usr/local/bin/tippecanoe}" ]; then
    echo "[etl] tippecanoe not found; download/install is left to infra subagent." >&2
fi

exec "${EGIB_PYTHON:-python}" -m egib_sync "$@"