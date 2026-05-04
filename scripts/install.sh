#!/usr/bin/env bash
# install.sh — Linux one-command installer for Ollama Chat.
#
# Usage:
#   curl -fsSL https://your-repo/install.sh | bash
#   ./install.sh
#
# Idempotent: re-running upgrades the app and skips already-installed deps.
# Never overwrites your workspace files.
#
# Windows users: use WSL (Ubuntu) and run this same script inside it.

set -euo pipefail

APP_DIR="${OLLAMA_CHAT_DIR:-$HOME/.local/share/ollama-chat}"
WORKSPACE_DIR="${OLLAMA_CHAT_WORKSPACE:-$HOME/ollama-chat-workspace}"
REPO_URL="${OLLAMA_CHAT_REPO:-https://github.com/YOUR_USER/ollama-chat}"
NODE_MIN=18

c_green() { printf "\033[32m%s\033[0m\n" "$*"; }
c_blue()  { printf "\033[34m%s\033[0m\n" "$*"; }
c_yel()   { printf "\033[33m%s\033[0m\n" "$*"; }
c_red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()    { c_blue ""; c_blue "▸ $*"; }
ok()      { c_green "  ✓ $*"; }
skip()    { c_yel   "  ⊙ $*"; }

# ---------------------------------------------------------------- 1. Node
step "Checking Node.js (>= $NODE_MIN)"
need_node=1
if command -v node >/dev/null 2>&1; then
  v=$(node -p "process.versions.node.split('.')[0]")
  if [ "$v" -ge "$NODE_MIN" ]; then ok "node $(node -v)"; need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  if ! command -v nvm >/dev/null 2>&1 && [ ! -s "$HOME/.nvm/nvm.sh" ]; then
    c_yel "  installing nvm…"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # shellcheck disable=SC1091
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
  nvm install --lts
  ok "node $(node -v)"
fi

# ---------------------------------------------------------------- 2. Ollama
step "Checking Ollama"
if command -v ollama >/dev/null 2>&1; then
  ok "ollama $(ollama --version | head -n1)"
else
  c_yel "  installing ollama…"
  curl -fsSL https://ollama.com/install.sh | sh
  ok "ollama installed"
fi

# ---------------------------------------------------------------- 3. App
step "Installing app to $APP_DIR"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  (cd "$APP_DIR" && git pull --ff-only) && ok "updated"
elif [ -d "$APP_DIR" ]; then
  skip "exists at $APP_DIR (no .git — leaving as-is)"
else
  if command -v git >/dev/null 2>&1; then
    git clone --depth=1 "$REPO_URL" "$APP_DIR"
    ok "cloned"
  else
    c_yel "  git not found — downloading tarball"
    mkdir -p "$APP_DIR"
    curl -fsSL "$REPO_URL/archive/refs/heads/main.tar.gz" \
      | tar -xz --strip-components=1 -C "$APP_DIR"
    ok "downloaded"
  fi
fi

# ---------------------------------------------------------------- 4. Deps + build
step "Installing dependencies"
(cd "$APP_DIR" && npm install --no-fund --no-audit) && ok "frontend deps"
(cd "$APP_DIR/server" && npm install --no-fund --no-audit --omit=dev) && ok "backend deps"

step "Building SPA"
(cd "$APP_DIR" && npm run build) && ok "dist/ ready"

# ---------------------------------------------------------------- 5. Workspace
step "Workspace at $WORKSPACE_DIR"
if [ -d "$WORKSPACE_DIR" ]; then
  skip "exists — leaving your files untouched"
else
  mkdir -p "$WORKSPACE_DIR"
  cp -r "$APP_DIR/workspace/." "$WORKSPACE_DIR/"
  ok "scaffolded default workspace"
fi

# ---------------------------------------------------------------- 6. Index
step "Building retrieval index"
(cd "$APP_DIR/server" && OLLAMA_CHAT_WORKSPACE="$WORKSPACE_DIR" npm run index) && ok "index built"

# ---------------------------------------------------------------- 7. Launcher
step "Installing launcher"
LAUNCHER="$HOME/.local/bin/ollama-chat"
mkdir -p "$(dirname "$LAUNCHER")"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
export OLLAMA_CHAT_WORKSPACE="$WORKSPACE_DIR"
cd "$APP_DIR/server" && exec node index.js "\$@"
EOF
chmod +x "$LAUNCHER"
ok "launcher: $LAUNCHER"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) c_yel "  add ~/.local/bin to PATH (e.g. echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc)";;
esac

# ---------------------------------------------------------------- 8. Desktop entry (optional)
if [ -d "$HOME/.local/share/applications" ] || mkdir -p "$HOME/.local/share/applications"; then
  cat > "$HOME/.local/share/applications/ollama-chat.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Ollama Chat
Comment=Folder-driven local-first Ollama chat
Exec=$LAUNCHER
Icon=utilities-terminal
Terminal=false
Categories=Development;Utility;
EOF
  ok "desktop entry installed"
fi

# ---------------------------------------------------------------- 9. Launch
c_green ""
c_green "✓ Install complete."
c_green "  App      : $APP_DIR"
c_green "  Workspace: $WORKSPACE_DIR"
c_green "  Launcher : $LAUNCHER"
c_green ""
c_blue  "Starting Ollama Chat…"
exec "$LAUNCHER"
