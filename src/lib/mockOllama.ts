// Mock Ollama-style chat client. Used when the real backend is not reachable.
// In a deployed Lovable preview there is no Node backend, so this lets the
// SPA stay fully interactive. When you run install.sh locally the real
// /api endpoints take over.

import type { AssembledPrompt, ChatMessage, RetrievedSnippet, WorkspaceFile } from "./types";

const FAKE_LATENCY_MS = 30;

const SAMPLE_FILES: WorkspaceFile[] = [
  { path: "CLAUDE.md", kind: "identity", lines: 44 },
  { path: "CONTEXT.md", kind: "context", lines: 50 },
  { path: "REFERENCES.md", kind: "references", lines: 72 },
  { path: "workspace.json", kind: "config", lines: 24 },
  { path: "templates/default.prompt", kind: "template", lines: 38 },
  { path: "corpora/clief-notes-foundations.txt", kind: "corpus", lines: 79 },
  { path: "snippets/prompt-framework.md", kind: "snippet", lines: 34 },
];

const SAMPLE_SNIPPETS: RetrievedSnippet[] = [
  {
    file: "corpora/clief-notes-foundations.txt",
    lineStart: 28,
    lineEnd: 33,
    text: "LESSON 1.3: HOW TO STRUCTURE ANY PROMPT — A prompt is an instruction set. Five parts: Identity → Task → Context → Constraints → Output Format.",
    score: 0.91,
  },
  {
    file: "CONTEXT.md",
    lineStart: 8,
    lineEnd: 9,
    text: "The folder is memory. It carries persistent context across every session so the user never re-explains themselves. The prompt is direction.",
    score: 0.84,
  },
  {
    file: "snippets/prompt-framework.md",
    lineStart: 5,
    lineEnd: 9,
    text: "Part 2 — Task: clear action verb (write, review, analyze, compare, build, fix, summarize), defined scope, enough detail.",
    score: 0.71,
  },
];

export function listWorkspace(): WorkspaceFile[] {
  return SAMPLE_FILES;
}

function approxTokens(text: string): number {
  // ~4 chars per token heuristic
  return Math.max(1, Math.ceil(text.length / 4));
}

export function assemblePrompt(userTask: string, history: ChatMessage[]): AssembledPrompt {
  const identity =
    "You are assisting a cross-platform developer team to build an open-source, folder-driven Ollama chat app.";
  const context = `Project: local-first web SPA + Node backend that shells to the ollama CLI.
Workspace files preloaded: CLAUDE.md, CONTEXT.md, REFERENCES.md.`;
  const constraints = [
    "Plain language. Cross-platform. Local-first.",
    "Cite provenance (file:line) for any grounded claim.",
    "One clear thing per prompt.",
    "Never silently truncate context.",
  ];
  const outputFormat = "Markdown. Code in fenced blocks. Citations as [file:Lstart-end].";
  const snippets = userTask.trim()
    ? SAMPLE_SNIPPETS.filter((s) =>
        s.text.toLowerCase().includes(userTask.toLowerCase().split(" ")[0] ?? "") || true,
      ).slice(0, 3)
    : [];

  const sections = [
    `# Identity\n${identity}`,
    `# Task\n${userTask || "(no task)"}`,
    `# Context\n${context}\n\n## Retrieved snippets\n${snippets
      .map((s) => `- [${s.file}:L${s.lineStart}-${s.lineEnd}] ${s.text}`)
      .join("\n") || "(none)"}`,
    `# Constraints\n${constraints.map((c) => `- ${c}`).join("\n")}`,
    `# Output Format\n${outputFormat}`,
  ];
  const composed = sections.join("\n\n");
  const historyTokens = history.reduce((n, m) => n + approxTokens(m.content), 0);

  return {
    composed,
    sections: {
      identity,
      task: userTask,
      context,
      constraints,
      outputFormat,
    },
    snippets,
    tokens: {
      identity: approxTokens(identity),
      task: approxTokens(userTask),
      context: approxTokens(context) + snippets.reduce((n, s) => n + approxTokens(s.text), 0),
      constraints: approxTokens(constraints.join(" ")),
      outputFormat: approxTokens(outputFormat),
      history: historyTokens,
      total: approxTokens(composed) + historyTokens,
    },
  };
}

export async function* mockStream(prompt: AssembledPrompt, model: string) {
  const intro = `**[mock://${model}]** Folder loaded, prompt assembled with ${prompt.snippets.length} retrieved snippet(s).\n\n`;
  const body = `Here is a grounded answer using the five-part structure.

The folder is memory. The prompt is direction. Your task was assembled with **${prompt.tokens.total} tokens** across Identity, Task, Context, Constraints, and Output Format.

${prompt.snippets
  .map((s) => `> ${s.text}\n> — \`${s.file}:L${s.lineStart}-${s.lineEnd}\` (score ${s.score.toFixed(2)})`)
  .join("\n\n")}

Run \`./install.sh\` on Linux to swap this mock for a real Ollama-backed response.`;
  const text = intro + body;
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (Math.random() > 0.7) {
      yield buf;
      buf = "";
      await new Promise((r) => setTimeout(r, FAKE_LATENCY_MS));
    }
  }
  if (buf) yield buf;
}

export function mockTokenCount(text: string): number {
  return approxTokens(text);
}
