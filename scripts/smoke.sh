#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3110}"
HOST="${HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"

export PORT HOST
export CLAWDBOT_URL="${CLAWDBOT_URL:-ws://127.0.0.1:65535}"

npm run dev >/tmp/ops-ui-smoke.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for i in {1..40}; do
  if curl -fsS "$BASE_URL/api/monitor/diagnostics" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

curl -fsS "$BASE_URL/api/monitor/diagnostics" >/dev/null
curl -fsS "$BASE_URL/api/tasks" >/dev/null

echo "smoke ok: ${BASE_URL}"
