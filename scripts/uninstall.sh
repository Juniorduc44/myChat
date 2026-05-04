#!/usr/bin/env bash
# uninstall.sh — remove app + launcher. Workspace is preserved by default.
set -euo pipefail
APP_DIR="${OLLAMA_CHAT_DIR:-$HOME/.local/share/ollama-chat}"
LAUNCHER="$HOME/.local/bin/ollama-chat"
DESKTOP="$HOME/.local/share/applications/ollama-chat.desktop"
WORKSPACE_DIR="${OLLAMA_CHAT_WORKSPACE:-$HOME/ollama-chat-workspace}"

rm -rf "$APP_DIR" && echo "removed $APP_DIR"
rm -f  "$LAUNCHER" && echo "removed $LAUNCHER"
rm -f  "$DESKTOP"  && echo "removed $DESKTOP"

if [ "${1:-}" = "--purge" ]; then
  rm -rf "$WORKSPACE_DIR" && echo "purged workspace $WORKSPACE_DIR"
else
  echo "workspace preserved at $WORKSPACE_DIR (pass --purge to remove)"
fi
