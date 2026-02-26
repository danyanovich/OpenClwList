#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[run-local] Preparing OpenClwList (browser mode)..."

if ! command -v node >/dev/null 2>&1; then
  echo "[run-local] Node.js is not installed or not in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[run-local] npm is not installed or not in PATH."
  exit 1
fi

if [[ ! -f .env && -f .env.example ]]; then
  cp .env.example .env
  echo "[run-local] Created .env from .env.example"
fi

if [[ ! -d node_modules ]]; then
  echo "[run-local] Installing dependencies (npm ci)..."
  npm ci
fi

echo "[run-local] Running doctor checks..."
node scripts/doctor.mjs --mode=local

echo "[run-local] Starting dashboard in local mode..."
export OPS_UI_MODE=local
exec npm run dev
