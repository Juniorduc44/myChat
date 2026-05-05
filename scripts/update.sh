#!/usr/bin/env bash
# update.sh — pull latest, reinstall deps, rebuild SPA.
set -euo pipefail
APP_DIR="${MYCHAT_DIR:-$HOME/.local/share/mychat}"
cd "$APP_DIR"
git pull --ff-only || echo "(no git remote — skipping pull)"
npm install --no-fund --no-audit
(cd server && npm install --no-fund --no-audit --omit=dev)
npm run build
echo "✓ myChat updated."
