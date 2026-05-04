# Prompt Framework — Five Parts

Use this as a quick reference when writing prompts or building the prompt assembler.

**Part 1 — Identity**: Who is the assistant right now? Role, tone, depth, vocabulary. Handled by CLAUDE.md for ongoing sessions. Add inline only when shifting roles for a one-off task.

**Part 2 — Task**: What needs to get done? Requires: a clear action verb (write, review, analyze, compare, build, fix, summarize), a defined scope (length, format, section), and enough detail that someone unfamiliar could attempt it.

**Part 3 — Context**: What does the model need to know? Background, constraints, audience, prior decisions, relevant data. For this app: loaded from CONTEXT.md + top-K retrieved corpus snippets with file:line provenance.

**Part 4 — Constraints**: What should the model avoid? Negative instructions are as valuable as positive ones. Every constraint stated is a mistake not made. Think: what annoyed you about the last three outputs? Those are your missing constraints.

**Part 5 — Output Format**: What shape should the result take? List, table, code block, numbered steps, prose paragraphs, JSON? Stating the format prevents 20 minutes of reformatting.

---

## Task type → parts needed

| Task type        | Parts to include                              |
|------------------|-----------------------------------------------|
| Simple / quick   | Task only                                     |
| Creative         | Identity + Task + Constraints + Output Format |
| Complex          | All five                                      |
| Ongoing project  | Identity + Context in files; Task + Constraints per prompt |

---

## Chunking rule

One prompt = one clear thing.

For large inputs: send structure first → sections in order → synthesis last.
For large outputs: break into steps, review between each, only redo the step that went wrong.
