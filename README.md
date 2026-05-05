# myChat

> The folder is memory. The prompt is direction. They work together.

An open-source, local-first chat application powered by [Ollama](https://ollama.com).
Workspace-driven context, five-part prompt assembly (Clief Notes 1.3), SQLite FTS5
retrieval with file-line provenance, and an AI workspace builder that writes files
directly to disk.

**Linux is the primary target.** Windows users: run inside WSL (Ubuntu).

---

## One-command install (Linux / WSL)

```bash
curl -fsSL https://raw.githubusercontent.com/Juniorduc44/mychat/main/scripts/install.sh | bash
```

The installer:
1. Installs Node.js ≥18 (via nvm) if missing.
2. Installs Ollama if missing.
3. Clones this repo to `~/.local/share/mychat`.
4. Builds the SPA and installs backend deps.
5. Scaffolds `~/ollama-chat-workspaces/general` on first run (never overwrites).
6. Installs a launcher at `~/.local/bin/mychat` and a `.desktop` entry.
7. Starts the server and opens your browser at `http://localhost:3000`.

Re-run at any time to upgrade — every step is idempotent.

```bash
./scripts/update.sh              # pull + reinstall + rebuild
./scripts/uninstall.sh           # remove app, keep workspaces
./scripts/uninstall.sh --purge   # remove app and workspaces
```

---

## What it does

myChat runs entirely on your machine. There are no cloud calls unless you
explicitly use a `:cloud` model. Your conversations stay local.

**Workspaces** are folders that define who the AI is and what it knows:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Identity — role, method, rules |
| `CONTEXT.md` | Project background — what we're building, what good looks like |
| `REFERENCES.md` | Examples, links, notes |
| `workspace.json` | Model, token budget, retrieval settings |
| `templates/` | Reusable prompt templates |
| `snippets/` | Reusable prompt blocks |
| `corpora/` | Source documents indexed for FTS retrieval |

The **workspace builder** (Config → New Workspace) uses a tool-capable model to
write all these files directly to disk in one shot, guided by the Clief Notes 1.3
five-part prompt framework.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React SPA (Vite + shadcn/ui)    src/           │
│   Chat · Workspace builder · Config sidebar     │
│   Model capability badges · File upload         │
│   Mock mode when backend unreachable            │
└─────────────────────────────────────────────────┘
                    │ /api/*  (proxied by Vite in dev)
┌─────────────────────────────────────────────────┐
│  Fastify server              server/index.js    │
│   ├─ workspaceManager.js  scaffold / list       │
│   ├─ workspace.js         load files            │
│   ├─ retrieval.js         SQLite FTS5 BM25      │
│   ├─ prompt-assembler.js  five-part assembly    │
│   ├─ ws-builder.js        workspace builder AI  │
│   └─ Ollama REST API      /api/chat, /api/show  │
└─────────────────────────────────────────────────┘
                    │
          ~/ollama-chat-workspaces/
            general/   my-project/   ...
```

---

## Development

```bash
# 1. Install all deps (frontend + backend)
npm install
cd server && npm install && cd ..

# 2. Start the backend (port 3000)
node server/index.js

# 3. Start the frontend dev server (port 8080, proxies /api to :3000)
npm run dev
```

Open `http://localhost:8080` for the dev build with hot reload, or
`http://localhost:3000` for the production build served by the backend.

---

## Configuration

**`workspace.json`** — per-workspace settings:

```json
{
  "name": "general",
  "model": "llama3.1:8b",
  "port": 3000,
  "tokenBudget": { "maxTotal": 8192, "reserveForResponse": 2048, "contextTarget": 6144 },
  "retrieval": { "engine": "fts", "topK": 5, "includeProvenance": true }
}
```

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_CHAT_WORKSPACES` | `~/ollama-chat-workspaces` | Workspace root directory |
| `PORT` | `3000` | Backend server port |

---

## Roadmap

- [ ] Terminal / shell execution in trusted directories
- [ ] Optional embeddings (hnswlib-node) on top of FTS5
- [ ] Auto-reindex with chokidar
- [ ] Native desktop wrapper (Tauri)
- [ ] Windows-native installer (`install.ps1`)
