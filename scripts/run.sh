#!/usr/bin/env bash
# run.sh — build (if needed) then start the Ollama Chat server.
# On startup failure detects dependency issues and offers to auto-fix.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server/index.js"

_green() { printf "\033[32m%s\033[0m\n" "$*"; }
_blue()  { printf "\033[34m%s\033[0m\n" "$*"; }
_yel()   { printf "\033[33m%s\033[0m\n" "$*"; }
_red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

# ── Build SPA if dist/ is missing ──────────────────────────────────────────
if [ ! -d "$ROOT/dist" ] || [ ! -f "$ROOT/dist/index.html" ]; then
  _blue "▸ Building SPA…"
  (cd "$ROOT" && npm run build) || { _red "SPA build failed."; exit 1; }
fi

# ── Auto-fix helper ────────────────────────────────────────────────────────
fix_deps() {
  _yel ""
  _yel "⚠  Server crashed on startup (exit code $1)."
  _yel "   This is usually a missing or mismatched npm package."
  printf "\033[33m   Run 'npm install' in server/ to fix and retry? [Y/n] \033[0m"

  local ans
  read -r ans </dev/tty 2>/dev/null || ans="n"
  ans="${ans:-Y}"

  if [[ "${ans}" =~ ^[Yy] ]]; then
    _blue "▸ Installing server dependencies…"
    (cd "$ROOT/server" && npm install --no-fund --no-audit) \
      || { _red "npm install failed. Check errors above."; exit 1; }
    _green "✓ Dependencies updated."
    _blue "▸ Restarting server…"
    exec node "$SERVER" "$@"
  else
    _red "Aborted. Run 'npm install' in server/ manually, then retry."
    exit 1
  fi
}

# ── Start server ───────────────────────────────────────────────────────────
# Capture server exit code while letting all output go straight to the terminal.
node "$SERVER" "$@"
EXIT=$?

# 0 = clean exit, 130 = CTRL+C (SIGINT), 143 = SIGTERM → all normal shutdowns
case $EXIT in
  0|130|143) exit 0 ;;
esac

# Any other non-zero code means a crash → offer auto-fix
fix_deps "$EXIT" "$@"
