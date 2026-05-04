// server/lib/backup.js — workspace backup (zip download) and restore (zip upload).

import archiver from "archiver";
import unzipper from "unzipper";
import { mkdirSync, existsSync, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";

const WORKSPACES_ROOT = path.join(os.homedir(), "ollama-chat-workspaces");

// Stream a zip of one workspace (name) or all workspaces (name omitted) to reply.raw.
export function streamWorkspaceZip(reply, name) {
  const label = name ?? "all-workspaces";
  reply.raw.setHeader("content-type", "application/zip");
  reply.raw.setHeader("content-disposition", `attachment; filename="ollama-chat-${label}.zip"`);
  reply.raw.setHeader("cache-control", "no-cache");

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err) => { reply.raw.destroy(err); });
  archive.pipe(reply.raw);

  if (name) {
    const dir = path.join(WORKSPACES_ROOT, name);
    if (!existsSync(dir)) throw new Error(`Workspace "${name}" not found`);
    archive.directory(dir, name);
  } else {
    if (!existsSync(WORKSPACES_ROOT)) throw new Error("No workspaces directory found");
    archive.directory(WORKSPACES_ROOT, false);
  }

  return archive.finalize(); // returns a Promise
}

// Extract an uploaded zip stream into WORKSPACES_ROOT.
// Returns a list of top-level workspace names found in the zip.
export function restoreWorkspaceZip(fileStream) {
  mkdirSync(WORKSPACES_ROOT, { recursive: true });
  const restored = new Set();

  return new Promise((resolve, reject) => {
    const tasks = [];

    fileStream
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const parts = entry.path.replace(/\\/g, "/").split("/").filter(Boolean);
        if (parts[0]) restored.add(parts[0]);
        const dest = path.join(WORKSPACES_ROOT, ...parts);

        if (entry.type === "Directory") {
          mkdirSync(dest, { recursive: true });
          entry.autodrain();
        } else {
          mkdirSync(path.dirname(dest), { recursive: true });
          const task = new Promise((res, rej) => {
            const ws = createWriteStream(dest);
            entry.pipe(ws);
            ws.on("finish", res);
            ws.on("error", rej);
            entry.on("error", rej);
          });
          tasks.push(task);
        }
      })
      .on("finish", () => Promise.all(tasks).then(() => resolve([...restored])).catch(reject))
      .on("error", reject);
  });
}
