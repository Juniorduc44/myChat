// server/lib/retrieval.js — query the SQLite FTS5 index built by indexer.js.
// Returns snippets with file:line provenance and BM25 scores normalized to [0,1].

import Database from "better-sqlite3";
import path from "node:path";
import { existsSync } from "node:fs";

function dbPath(workspaceDir) {
  return path.join(workspaceDir, ".index.sqlite");
}

export function searchFTS(workspaceDir, query, k = 5) {
  if (!query?.trim()) return [];
  const p = dbPath(workspaceDir);
  if (!existsSync(p)) return [];
  const db = new Database(p, { readonly: true });
  try {
    // Use bm25 ranking; lower is better. Normalize to confidence 0..1.
    const rows = db
      .prepare(
        `SELECT file, line_start, line_end, text, bm25(chunks_fts) AS score
         FROM chunks_fts
         WHERE chunks_fts MATCH ?
         ORDER BY score
         LIMIT ?`,
      )
      .all(sanitize(query), k);
    if (rows.length === 0) return [];
    const max = Math.max(...rows.map((r) => r.score));
    return rows.map((r) => ({
      file: r.file,
      lineStart: r.line_start,
      lineEnd: r.line_end,
      text: r.text,
      score: Number((1 - r.score / (max + 0.001)).toFixed(3)),
    }));
  } finally {
    db.close();
  }
}

// Strip FTS5 special chars to avoid syntax errors on free-text input.
function sanitize(q) {
  return q
    .replace(/["'*()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" OR ");
}
