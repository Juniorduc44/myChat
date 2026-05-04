// server/lib/workspace.js — load workspace.json, list files, read files safely.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  name: "ollama-chat",
  model: "llama3",
  port: 3000,
  tokenBudget: { maxTotal: 8192, reserveForResponse: 2048, contextTarget: 6144 },
  retrieval: { engine: "fts", topK: 5, includeProvenance: true, truncationStrategy: "summarize" },
};

export function loadWorkspace(dir) {
  const cfgPath = path.join(dir, "workspace.json");
  if (!existsSync(cfgPath)) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(cfgPath, "utf8")) };
  } catch {
    return DEFAULTS;
  }
}

const KIND_BY_NAME = {
  "claude.md": "identity",
  "context.md": "context",
  "references.md": "references",
  "workspace.json": "config",
};
const KIND_BY_DIR = { snippets: "snippet", corpora: "corpus", templates: "template" };

function classify(rel) {
  const base = path.basename(rel).toLowerCase();
  if (KIND_BY_NAME[base]) return KIND_BY_NAME[base];
  const top = rel.split(path.sep)[0].toLowerCase();
  return KIND_BY_DIR[top] || "other";
}

export function listWorkspaceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  function walk(d) {
    for (const name of readdirSync(d)) {
      const full = path.join(d, name);
      const rel = path.relative(dir, full);
      if (name.startsWith(".") || name === "node_modules") continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const txt = readFileSync(full, "utf8");
        out.push({ path: rel, kind: classify(rel), lines: txt.split("\n").length, bytes: st.size });
      }
    }
  }
  walk(dir);
  return out;
}

// Path-traversal guard.
function safe(dir, p) {
  const full = path.resolve(dir, p);
  if (!full.startsWith(path.resolve(dir))) throw new Error("invalid path");
  return full;
}

export function readWorkspaceFile(dir, p) {
  return readFileSync(safe(dir, p), "utf8");
}
