#!/usr/bin/env bash
# run.sh — build (if needed) then start the Ollama Chat server.
# Usage: ./scripts/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build SPA if dist/ is missing or stale
if [ ! -d "$ROOT/dist" ] || [ "$ROOT/src" -nt "$ROOT/dist" ] 2>/dev/null; then
  echo "▸ Building SPA…"
  (cd "$ROOT" && npm run build)
fi

exec node "$ROOT/server/index.js" "$@"
