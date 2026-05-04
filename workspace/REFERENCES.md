# References

## Core methodology
- **Folder-driven context (Clief Notes / Lessons 1.2 & 1.3)** — The theoretical backbone of this project.
  - The folder is memory. Three files (CLAUDE.md, CONTEXT.md, REFERENCES.md) carry persistent identity, project context, and reference material across every session. The user never re-explains themselves.
  - The prompt is direction. Per-message prompts carry the task, constraints, and output format for that specific ask.
  - Five-part prompt structure: Identity → Task → Context → Constraints → Output Format. Use the minimum parts needed; add all five for complex tasks.
  - Chunking rule: one prompt = one clear thing. For large inputs, send structure first, sections in order, then ask for synthesis. Never dump everything into one message.
  - Source: Clief Notes "The Foundation" course, lessons 1.2 and 1.3.

## Examples of good work
- Local-first CLI wrappers with web UIs (pattern: backend shells to local binary, SPA talks to backend).
- Folder-driven context approaches ("context-as-code") that use small files to define identity, scope, and references.
- Simple provenance citation in model outputs (filename + snippet + confidence).
- One-command installers (pattern: detect → install deps → download app → scaffold → launch → open browser).

## Relevant tools & links
- Ollama CLI (local model serving) — use local installation; ensure cross-platform guidance in README.
  - Linux one-liner: `curl -fsSL https://ollama.com/install.sh | sh`
  - Windows: download and run the `.exe` from https://ollama.com/download/windows
  - Model library: https://ollama.com/library
- Node.js (>=18) — backend runtime for shelling to Ollama and running SQLite.
  - Linux: install via `nvm` (https://github.com/nvm-sh/nvm) for version flexibility.
  - Windows: install via `winget install OpenJS.NodeJS.LTS` or direct download from https://nodejs.org.
- nvm (https://github.com/nvm-sh/nvm) — Node version manager for Linux/macOS install automation.
- nvm-windows (https://github.com/coreybutler/nvm-windows) — Windows equivalent.
- winget — built-in Windows package manager (available on Windows 10 1709+).
- Electron (https://www.electronjs.org/) — native desktop option (cross-platform).
- Tauri (https://tauri.app/) — lightweight native desktop option (cross-platform; Rust tooling).
- SQLite with FTS5 — local full-text search for grounding (works on Windows and Linux).
- SQLite + embeddings: Node bindings for optional vector index (hnswlib preferred over Faiss for Windows compatibility).
- Embedding providers: use local embedding models where possible; otherwise make embeddings optional.
- Cross-platform packagers: NSIS (Windows), AppImage / deb / rpm (Linux) or Tauri build pipeline.
- Web UI frameworks: React / Vite or Svelte (choose minimal + fast).
- `open` / `start` / `xdg-open` — cross-platform browser-open commands from Node.js `child_process`.

## Installer script spec
Two scripts, one per platform:
- `install.sh` — Bash, targets Linux. Entry point: `curl -fsSL https://your-repo/install.sh | bash`
- `install.ps1` — PowerShell, targets Windows 10/11. Entry point: `irm https://your-repo/install.ps1 | iex`

Both follow the same step order:
1. Check OS and architecture.
2. Install Node.js ≥18 if not present.
3. Install Ollama if not present.
4. Download latest app release (GitHub releases tarball; fallback to `git clone`).
5. `npm install --omit=dev` inside app directory.
6. Scaffold default workspace (`~/ollama-chat-workspace/`) if it doesn't exist.
7. Write a launcher script.
8. Optionally create a desktop shortcut.
9. Start the server and open `http://localhost:3000` in the default browser.

Idempotency rule: if a step's target already exists and is valid, skip it with a status message. Never overwrite existing workspace files.

Companion scripts:
- `update.sh` / `update.ps1` — pull latest release, re-run `npm install`, restart server.
- `uninstall.sh` / `uninstall.ps1` — remove app files and launchers; leave workspace folder in place by default.

## Notes
- Always show token count stats (in / out / total) per message so users understand model usage.
- Workspace folder spec (minimum files):
  - `CLAUDE.md` — identity + rules + prompt assembly instructions
  - `CONTEXT.md` — project context + goals + what to avoid
  - `REFERENCES.md` — links, notes, examples, methodology
  - `/snippets/*.md` — reusable text snippets
  - `/corpora/*.txt` — documents to index and cite
  - `/templates/*.prompt` — prompt templates using the five-part structure
  - `workspace.json` — model, token budget, port, retrieval config
- Grounding strategy: index corpora with SQLite FTS, run top-K retrieval per query, include top-N snippets with file:line metadata in the prompt. If token budget may overflow, include short summaries instead of full snippets. Log all truncations — never drop context silently.
- For Windows compatibility: avoid native OS-specific node modules that require compiled binaries. Favor pure JS or cross-compiled libs.
- Port conflict detection: default port 3000, configurable via `workspace.json` or `PORT` env var, auto-increments on conflict.
- First-run UX: if `ollama list` returns no models, show a "Pull your first model" screen with copy-paste instructions and link to https://ollama.com/library.
