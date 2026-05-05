#!/usr/bin/env bash
# uninstall.sh — remove app + launcher. Workspaces are preserved by default.
set -euo pipefail
APP_DIR="${MYCHAT_DIR:-$HOME/.local/share/mychat}"
LAUNCHER="$HOME/.local/bin/mychat"
DESKTOP="$HOME/.local/share/applications/mychat.desktop"
WORKSPACES_ROOT="${OLLAMA_CHAT_WORKSPACES:-$HOME/ollama-chat-workspaces}"

rm -rf "$APP_DIR" && echo "removed $APP_DIR"
rm -f  "$LAUNCHER" && echo "removed $LAUNCHER"
rm -f  "$DESKTOP"  && echo "removed $DESKTOP"

if [ "${1:-}" = "--purge" ]; then
  rm -rf "$WORKSPACES_ROOT" && echo "purged workspaces $WORKSPACES_ROOT"
else
  echo "workspaces preserved at $WORKSPACES_ROOT (pass --purge to remove)"
fi
