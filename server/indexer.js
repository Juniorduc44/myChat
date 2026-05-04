// server/indexer.js — walks the workspace, chunks /corpora files by paragraph,
// and indexes them into a SQLite FTS5 table at <workspace>/.index.sqlite.
//
// Run:  npm run index
// Re-running is safe — the table is rebuilt from scratch.
//
// Provenance: every row stores file path + line_start + line_end so the
// retrieval layer can cite [file:Lstart-end] in prompts.

import Database from "better-sqlite3";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const WORKSPACE =
  process.env.OLLAMA_CHAT_WORKSPACE ||
  path.join(os.homedir(), "ollama-chat-workspace");

if (!existsSync(WORKSPACE)) {
  console.error(`workspace not found: ${WORKSPACE}`);
  process.exit(1);
}

const dbPath = path.join(WORKSPACE, ".index.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  DROP TABLE IF EXISTS chunks_fts;
  CREATE VIRTUAL TABLE chunks_fts USING fts5(
    file UNINDEXED,
    line_start UNINDEXED,
    line_end UNINDEXED,
    text,
    tokenize = 'porter unicode61'
  );
`);

const insert = db.prepare(
  "INSERT INTO chunks_fts(file, line_start, line_end, text) VALUES (?, ?, ?, ?)",
);

// Index corpora + snippets + the three top-level memory files.
const targets = [
  "CLAUDE.md",
  "CONTEXT.md",
  "REFERENCES.md",
];
const dirs = ["corpora", "snippets", "templates"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = [];
for (const t of targets) {
  const p = path.join(WORKSPACE, t);
  if (existsSync(p)) files.push(p);
}
for (const d of dirs) {
  const p = path.join(WORKSPACE, d);
  if (existsSync(p)) files.push(...walk(p));
}

let chunkCount = 0;
const tx = db.transaction(() => {
  for (const file of files) {
    const rel = path.relative(WORKSPACE, file);
    const lines = readFileSync(file, "utf8").split("\n");
    // Chunk by blank-line groups, max ~40 lines per chunk.
    let buf = [];
    let start = 1;
    const flush = (endLine) => {
      const text = buf.join("\n").trim();
      if (text.length >= 20) {
        insert.run(rel, start, endLine, text);
        chunkCount++;
      }
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (buf.length === 0) start = i + 1;
      buf.push(line);
      const blank = line.trim() === "";
      if ((blank && buf.length > 1) || buf.length >= 40) flush(i + 1);
    }
    if (buf.length) flush(lines.length);
  }
});
tx();

console.log(`indexed ${chunkCount} chunks from ${files.length} files → ${dbPath}`);
db.close();
