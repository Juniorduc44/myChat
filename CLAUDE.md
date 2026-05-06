# myChat — Project Standards for AI Assistants

This file is read by Claude Code at the start of every session. Follow these rules exactly when modifying this codebase. They exist because violations have caused regressions before.

---

## Core rule: no new mock code

`src/lib/mockOllama.ts` is legacy. It exists solely to handle the case where the Fastify backend is unreachable (`status.reachable === false`). That single fallback path is the **entire** intended scope of mock behavior.

**Never:**
- Add a new `if (mockMode) { ... }` branch to any component
- Add client-side simulations of backend behavior
- Return fake data from a function when the real API could be called
- Add a `mockMode` prop to a new component

**When the backend is down**, the correct UX is a status banner (already implemented in `TopBar`) telling the user the backend is unreachable. Nothing else should change.

If you catch yourself writing a mock path, stop. Wire the real `/api/*` endpoint instead or leave the feature unimplemented until the backend is ready.

---

## Architecture rules

### Backend is the authority
- Model list → `GET /api/status`
- Workspace list → `GET /api/workspaces`
- File content → `GET /api/file?path=…`
- Settings → `GET /api/settings`

Never hardcode these in the frontend. Never derive them from local state that isn't fetched from the backend.

### Real streaming, always
All chat and workspace-builder responses stream NDJSON from the Fastify server. The frontend consumes `AsyncGenerator<NdjsonEvent>`. Don't add non-streaming code paths for responses.

### Tool-calling for file creation
When the workspace builder creates files, it uses the Ollama tool-calling agentic loop (`runWsBuilderWithTools` in `server/index.js`). Text-only output for file blocks is the fallback for non-tools models, not the default.

### Skills are opt-in toggles
Browser-harness and future skills attach to the chat as toggle buttons in the input bar. They use Ollama tool-calling on the backend. A skill is never injected silently into every request — the user activates it per-chat.

---

## Files to read before touching anything

| Area | Key files |
|---|---|
| Chat flow | `src/pages/Index.tsx`, `src/components/chat/ChatPanel.tsx` |
| Backend routes | `server/index.js` |
| Workspace management | `server/lib/workspaceManager.js` |
| Prompt assembly | `server/lib/prompt-assembler.js` |
| Model capabilities | `src/lib/capabilities.ts` |
| API client | `src/lib/api.ts` |
| Types | `src/lib/types.ts` |

---

## Commit discipline
- Build (`npm run build`) must pass before every commit — zero TypeScript errors
- Commit message explains *why*, not just what
- Push after every meaningful feature or fix so the repo stays current
