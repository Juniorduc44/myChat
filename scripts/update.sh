#!/usr/bin/env bash
# update.sh — pull latest, reinstall deps, rebuild SPA, rebuild index.
set -euo pipefail
APP_DIR="${OLLAMA_CHAT_DIR:-$HOME/.local/share/ollama-chat}"
WORKSPACE_DIR="${OLLAMA_CHAT_WORKSPACE:-$HOME/ollama-chat-workspace}"
cd "$APP_DIR"
git pull --ff-only || echo "(no git remote — skipping pull)"
npm install --no-fund --no-audit
(cd server && npm install --no-fund --no-audit --omit=dev)
npm run build
(cd server && OLLAMA_CHAT_WORKSPACE="$WORKSPACE_DIR" npm run index)
echo "✓ updated."
