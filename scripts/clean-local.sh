#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VACUUM_DB=0
if [[ "${1:-}" == "--vacuum-db" ]]; then
  VACUUM_DB=1
fi

echo "Cleaning local build/cache artifacts..."
rm -rf .next
rm -f tsconfig.tsbuildinfo
rm -f *.log
rm -f logs/*.log 2>/dev/null || true

if [[ "$VACUUM_DB" -eq 1 ]]; then
  DB_PATH="data/ops-ui.sqlite"
  if [[ -f "$DB_PATH" ]]; then
    if command -v sqlite3 >/dev/null 2>&1; then
      echo "Checkpointing WAL and vacuuming SQLite database..."
      sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"
    else
      echo "sqlite3 not found; skipping DB vacuum."
    fi
  else
    echo "Database not found at $DB_PATH; skipping DB vacuum."
  fi
fi

echo "Done."
