// server/lib/prompt-assembler.js — five-part prompt assembly.
// Identity → Task → Context → Constraints → Output Format.
// Loads identity from CLAUDE.md, context from CONTEXT.md, appends retrieval
// snippets with file:line provenance, respects token budget. Truncations are
// always logged in the returned `prompt.warnings` array — never silent.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function approxTokens(s) {
  if (!s) return 0;
  return Math.max(1, Math.ceil(String(s).length / 4));
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// Pull the "## Rules" or top of CLAUDE.md as identity.
function extractIdentity(claudeMd) {
  if (!claudeMd) return "You are a helpful local assistant.";
  // Take everything before the first "## Prompt assembly" or first 1500 chars.
  const cut = claudeMd.search(/^##\s+Prompt assembly/im);
  return (cut > 0 ? claudeMd.slice(0, cut) : claudeMd.slice(0, 1500)).trim();
}

function extractContext(contextMd) {
  if (!contextMd) return "";
  return contextMd.slice(0, 2400).trim();
}

const DEFAULT_CONSTRAINTS = [
  "Plain language. Cross-platform. Local-first.",
  "Cite provenance (file:line) for any grounded claim.",
  "One clear thing per prompt.",
  "Never silently truncate context.",
];

const DEFAULT_OUTPUT = "Markdown. Code in fenced blocks. Citations as [file:Lstart-end].";

function readDefaultPrompt(workspaceDir) {
  const p = path.join(workspaceDir, "templates", "default.prompt");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : DEFAULT_OUTPUT;
}

export function assemblePrompt({ workspaceDir, task, history = [], snippets = [], tokenBudget }) {
  const warnings = [];
  const identity = extractIdentity(readIfExists(path.join(workspaceDir, "CLAUDE.md")));
  const contextDoc = extractContext(readIfExists(path.join(workspaceDir, "CONTEXT.md")));

  const budget = tokenBudget ?? { maxTotal: 8192, reserveForResponse: 2048, contextTarget: 6144 };
  const target = budget.contextTarget ?? budget.maxTotal - budget.reserveForResponse;

  // Snippets: keep adding until we'd blow the context budget, then summarize.
  const outputFormat = readDefaultPrompt(workspaceDir);
  const headerCost =
    approxTokens(identity) + approxTokens(task) + approxTokens(contextDoc) +
    approxTokens(DEFAULT_CONSTRAINTS.join(" ")) + approxTokens(outputFormat);
  let used = headerCost + history.reduce((n, m) => n + approxTokens(m.content), 0);
  const kept = [];
  for (const s of snippets) {
    const cost = approxTokens(s.text) + 32; // overhead for provenance line
    if (used + cost <= target) {
      kept.push(s);
      used += cost;
    } else {
      const summary = s.text.slice(0, 160) + (s.text.length > 160 ? "…" : "");
      warnings.push(`truncated ${s.file}:L${s.lineStart}-${s.lineEnd} (kept ${summary.length}/${s.text.length} chars)`);
      kept.push({ ...s, text: summary, truncated: true });
      used += approxTokens(summary) + 32;
      if (used >= target) break;
    }
  }

  const snippetBlock =
    kept.length === 0
      ? "(no retrieved snippets)"
      : kept
          .map(
            (s) =>
              `- [${s.file}:L${s.lineStart}-${s.lineEnd}${s.truncated ? " · truncated" : ""}] ${s.text}`,
          )
          .join("\n");

  const sections = {
    identity,
    task: task || "",
    context: `${contextDoc}\n\n## Retrieved snippets\n${snippetBlock}`,
    constraints: DEFAULT_CONSTRAINTS,
    outputFormat,
  };

  const composed =
    `# Identity\n${sections.identity}\n\n` +
    `# Task\n${sections.task}\n\n` +
    `# Context\n${sections.context}\n\n` +
    `# Constraints\n${sections.constraints.map((c) => `- ${c}`).join("\n")}\n\n` +
    `# Output Format\n${sections.outputFormat}\n`;

  const tokens = {
    identity: approxTokens(sections.identity),
    task: approxTokens(sections.task),
    context: approxTokens(sections.context),
    constraints: approxTokens(sections.constraints.join(" ")),
    outputFormat: approxTokens(sections.outputFormat),
    history: history.reduce((n, m) => n + approxTokens(m.content), 0),
    total: approxTokens(composed) + history.reduce((n, m) => n + approxTokens(m.content), 0),
  };

  return { composed, sections, snippets: kept, tokens, warnings };
}
