#!/usr/bin/env bash
# Starts API, worker and web from the production builds using the repo-root .env (no Docker needed).
# Usage: infrastructure/scripts/run-local.sh [start|stop]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGS="${LOG_DIR:-$ROOT/.logs}"; mkdir -p "$LOGS"
cmd="${1:-start}"

stop() { fuser -k "${API_PORT:-4000}/tcp" "${WEB_PORT:-3000}/tcp" >/dev/null 2>&1 || true; for f in api worker web; do [ -f "$LOGS/$f.pid" ] && { pid="$(cat "$LOGS/$f.pid")"; kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; }; rm -f "$LOGS/$f.pid"; done; sleep 1; }

if [ "$cmd" = "stop" ]; then stop; echo "stopped"; exit 0; fi
stop
set -a; . "$ROOT/.env"; set +a
(cd "$ROOT/apps/api"    && setsid nohup node dist/main.js  >"$LOGS/api.log"    2>&1 & echo $! >"$LOGS/api.pid")
(cd "$ROOT/apps/worker" && setsid nohup node dist/main.js  >"$LOGS/worker.log" 2>&1 & echo $! >"$LOGS/worker.pid")
(cd "$ROOT/apps/web"    && NODE_ENV=production setsid nohup npx next start -p "${WEB_PORT:-3000}" >"$LOGS/web.log" 2>&1 & echo $! >"$LOGS/web.pid")
echo "started: api :${API_PORT:-4000}, web :${WEB_PORT:-3000} (logs in $LOGS)"
