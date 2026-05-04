## CLAUDE.md
# Identity
You are assisting a cross-platform developer team (primarily Linux + Windows users) to build an open-source, folder-driven Ollama chat app with a web-first UI and optional native desktop frontends.

## Rules
- Write in plain, clear language.
- Prefer cross-platform, minimal-dependency solutions.
- Default to local-first: run Ollama models locally via the ollama CLI when available.
- Provide a web UI fallback for systems where a native GUI is problematic.
- Preload project-folder context (identity, context, references, snippets, corpora) into prompts to reduce hallucinations.
- Use explicit provenance for grounded responses (file name, path, and snippet indices).
- Prefer small, auditable libraries over large opaque frameworks.
- Ask clarifying questions only when necessary to avoid incorrect technical choices.
- When uncertain about an OS-specific detail, provide both Linux and Windows options and note tradeoffs.

## Prompt assembly rules
Every prompt the app assembles for the model must follow the five-part structure below.
Not all five parts are required every time — use the minimum needed for the task type.

1. **Identity** — Who is the assistant right now? Loaded from CLAUDE.md. Sets vocabulary, depth, and assumptions.
2. **Task** — What needs to get done? Clear action verb + defined scope. If a stranger could not attempt it without five follow-up questions, it is too vague.
3. **Context** — What does the model need to know? Loaded from CONTEXT.md + top-K retrieved snippets from corpora. Include file:line provenance on every snippet.
4. **Constraints** — What should the model avoid? Loaded from workspace rules + per-session user constraints. Every constraint is a mistake the model will not make.
5. **Output Format** — What shape should the result take? Explicit format prevents reformatting work downstream.

### When to use which parts
| Task type | Parts required |
|-----------|---------------|
| Simple / one-shot | Task only |
| Creative | Identity + Task + Constraints + Output Format |
| Complex / analytical | All five |
| Ongoing project session | Identity + Context from files; Task + Constraints per message |

## Chunking rules
- Each prompt asks for one clear thing. Do not bundle multiple distinct requests.
- For large corpora: feed Claude the structure first, then sections in order, then ask for synthesis across all sections.
- If token budget may overflow: include short summaries of retrieved snippets instead of full text. Never silently drop snippets — always log what was truncated.
- Keep structured data (tables, JSON) in its native format. Do not convert to prose before passing to the model.

## Operational notes
- Assume Node.js (>=18) as the cross-platform backend runtime.
- Assume Electron or Tauri for native desktop builds; include a simple static web server + SPA fallback.
- Use SQLite FTS (or a lightweight vector-store option) for local retrieval. Provide both FTS and optional embeddings-based retrieval as upgrade paths.
- The folder is memory. The prompt is direction. They work together — files carry persistent context, prompts carry per-task direction.
