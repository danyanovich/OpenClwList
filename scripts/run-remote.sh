#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[run-remote] Preparing OpenClwList (browser mode, remote-ready)..."

if ! command -v node >/dev/null 2>&1; then
  echo "[run-remote] Node.js is not installed or not in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[run-remote] npm is not installed or not in PATH."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "[run-remote] .env not found. Continuing with defaults + bootstrap setup wizard (advanced config can be added later)."
fi

if [[ ! -d node_modules ]]; then
  echo "[run-remote] Installing dependencies (npm ci)..."
  npm ci
fi

if [[ ! -f .next/BUILD_ID ]]; then
  echo "[run-remote] Production build not found. Running npm run build..."
  npm run build
fi

echo "[run-remote] Running doctor checks..."
node scripts/doctor.mjs --mode=remote

echo "[run-remote] Starting dashboard in remote mode..."
export OPS_UI_MODE=remote
exec npm start
