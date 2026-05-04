# Current Project

This is the **general workspace** — the default starting point for Ollama Chat.

## What this workspace is for

General-purpose conversations and workspace creation. Use this workspace to:
- Ask questions and get grounded answers
- Create specialized workspaces for specific subjects or projects
- Explore what this app can do

## How workspaces work

Each workspace is a folder containing:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Identity — who the AI is, what method it follows |
| `CONTEXT.md` | Project context — what the AI needs to know about this workspace |
| `REFERENCES.md` | Background reading — indexed for retrieval with file:line provenance |
| `workspace.json` | Config — model, token budget, retrieval settings |
| `templates/default.prompt` | Output format — how responses are shaped (Part 5 of the five-part framework) |
| `snippets/` | Reusable prompt fragments — skills the AI can invoke |
| `corpora/` | Documents indexed for FTS retrieval |

## Creating a new workspace

Ask the AI to help you create a workspace. It will:
1. Ask you for the subject, role, and constraints
2. Generate all required files using the five-part prompt structure
3. Show you each file for review before saving
4. Save the workspace so you can switch to it from the sidebar

## The five-part structure (Clief Notes 1.3)

The folder is memory. The prompt is direction. They work together.

- Identity + Context → live in workspace files (persistent across sessions)
- Task + Constraints → live in each message (per-task direction)
- Output Format → lives in `templates/default.prompt` (shapes every response)
