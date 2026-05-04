# Ollama Chat

> The folder is memory. The prompt is direction. They work together.

An open-source, local-first chat application for [Ollama](https://ollama.com).
Folder-driven context, five-part prompt assembly, SQLite FTS retrieval with
file-line provenance.

**Linux is the primary target.** Windows users: run this inside WSL (Ubuntu).

---

## One-command install (Linux / WSL)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/ollama-chat/main/scripts/install.sh | bash
```

The installer:
1. Installs Node.js ≥18 (via nvm) if missing.
2. Installs Ollama if missing.
3. Clones / downloads this app to `~/.local/share/ollama-chat`.
4. Builds the SPA, installs backend deps.
5. Scaffolds `~/ollama-chat-workspace/` on first run (never overwrites).
6. Builds the SQLite FTS index from `corpora/`.
7. Installs a launcher at `~/.local/bin/ollama-chat` and a `.desktop` entry.
8. Starts the server and opens your browser.

Re-run the script at any time to upgrade — every step is idempotent.

```bash
./scripts/update.sh    # pull + reinstall + rebuild + reindex
./scripts/uninstall.sh # remove app; keep workspace
./scripts/uninstall.sh --purge  # remove workspace too
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React SPA (Vite)              src/                         │
│   • Chat panel · Workspace sidebar · Prompt inspector       │
│   • Mock mode if backend unreachable                        │
└──────────────────────────────────────────────────────────────┘
                          │ /api/*
┌──────────────────────────────────────────────────────────────┐
│  Fastify server                server/index.js              │
│   ├─ workspace.js   load CLAUDE.md, CONTEXT.md, list files  │
│   ├─ retrieval.js   SQLite FTS5 BM25 search                 │
│   ├─ prompt-assembler.js  five-part assembly + budget       │
│   └─ execa → ollama run <model> --nowordwrap (streamed)     │
└──────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │  ~/ollama-chat-   │
                │  workspace/       │
                │   CLAUDE.md       │   ← identity
                │   CONTEXT.md      │   ← project
                │   REFERENCES.md   │   ← background
                │   workspace.json  │   ← model, port, budget
                │   snippets/       │
                │   templates/      │
                │   corpora/        │   ← indexed for retrieval
                │   .index.sqlite   │   ← FTS5 index
                └───────────────────┘
```

### The five-part prompt (built on every message)

| # | Part          | Source                                       |
|---|---------------|----------------------------------------------|
| 1 | Identity      | `CLAUDE.md`                                  |
| 2 | Task          | The user's message                           |
| 3 | Context       | `CONTEXT.md` + top-K snippets from `corpora/`|
| 4 | Constraints   | Workspace rules + per-session                |
| 5 | Output Format | Workspace defaults + per-session             |

Token budget from `workspace.json`. Truncations are logged in
`prompt.warnings` — never silent.

---

## Development

```bash
# Frontend (this repo root)
npm install
npm run dev            # Vite at :5173

# Backend (separate Node process)
cd server
npm install
OLLAMA_CHAT_WORKSPACE=../workspace npm run dev   # Fastify at :3000
OLLAMA_CHAT_WORKSPACE=../workspace npm run index # rebuild FTS index
```

In dev, set the SPA's API base by adding a Vite proxy if you want to talk to
the local Fastify server, or just rely on mock mode in the SPA preview.

---

## Configuration — `workspace.json`

```json
{
  "name": "ollama-chat",
  "model": "llama3",
  "port": 3000,
  "tokenBudget": { "maxTotal": 8192, "reserveForResponse": 2048, "contextTarget": 6144 },
  "retrieval": { "engine": "fts", "topK": 5, "includeProvenance": true, "truncationStrategy": "summarize" }
}
```

Override the workspace location with `OLLAMA_CHAT_WORKSPACE=/path/to/folder`.
Override the port with `PORT=4000`. Disable auto-open with `OPEN_BROWSER=0`.

---

## First-run UX

- If `ollama list` returns no models, the UI shows a "pull your first model"
  hint with copy-paste commands and a link to <https://ollama.com/library>.
- If the Fastify server isn't reachable, the SPA flips into **mock mode** with
  a clear banner — every screen still works, you just get canned responses.

---

## Roadmap

- [ ] Optional embeddings (hnswlib-node) on top of FTS5
- [ ] Auto-reindex with chokidar
- [ ] Native desktop wrapper (Tauri)
- [ ] Windows-native installer (`install.ps1`)
- [ ] Session save/load
