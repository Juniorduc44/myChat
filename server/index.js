// server/index.js — Fastify entry point.
// Local-first. Shells to the `ollama` CLI via execa. Falls back to mock mode
// when ollama is missing so the app always works on first launch.
//
// Routes:
//   GET  /api/status                — backend + ollama health, available models
//   GET  /api/workspaces            — list workspaces + active name
//   POST /api/workspaces            — create a new workspace { name, description, model }
//   PUT  /api/workspaces/active     — switch active workspace { name }
//   GET  /api/workspace             — list files in active workspace
//   GET  /api/file?path=…           — read a workspace file
//   PUT  /api/file                  — save a workspace file
//   POST /api/search                — FTS5 retrieval { q, k } -> snippets[]
//   POST /api/chat                  — { task, history, model } -> NDJSON stream
//   POST /api/models/pull           — stream pull progress
//   DELETE /api/models/:model       — remove a model
//   GET  /api/git-status            — branch, commit, submodule status
//   POST /api/update                — stream git pull + npm installs
//   GET  /                          — serves the built SPA (../dist)

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";

import {
  ensureDefaultWorkspace,
  getActiveWorkspaceName,
  setActiveWorkspaceName,
  getActiveWorkspaceDir,
  listWorkspaces,
  scaffoldWorkspace,
} from "./lib/workspaceManager.js";
import { loadWorkspace, listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from "./lib/workspace.js";
import { searchFTS } from "./lib/retrieval.js";
import { assemblePrompt, approxTokens } from "./lib/prompt-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Ensure a default workspace exists before we need it
ensureDefaultWorkspace();

const PORT = Number(process.env.PORT || 3000);

const fastify = Fastify({ logger: { transport: { target: "pino-pretty" } } });
await fastify.register(fastifyCors, { origin: true });

// --- Ollama helpers --------------------------------------------------------
async function ollamaInstalled() {
  try {
    await execa("ollama", ["--version"], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function ollamaModels() {
  try {
    const { stdout } = await execa("ollama", ["list"], { timeout: 2000 });
    return stdout
      .split("\n")
      .slice(1)
      .map((l) => l.split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function detectGpu() {
  try {
    await execa("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 1500 });
    return true;
  } catch { /* not found */ }
  try {
    await execa("rocm-smi", ["--showproductname"], { timeout: 1500 });
    return true;
  } catch { /* not found */ }
  return false;
}

function streamOllama(model, prompt, onChunk) {
  return new Promise((resolve, reject) => {
    const sub = execa("ollama", ["run", model, "--nowordwrap"], {
      input: prompt,
      buffer: false,
    });
    sub.stdout.on("data", (b) => onChunk(b.toString("utf8")));
    sub.on("error", reject);
    sub.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ollama exited ${code}`))));
  });
}

// Helper: get active workspace config at request-time
function activeConfig() {
  const dir = getActiveWorkspaceDir();
  return loadWorkspace(dir);
}

// --- Routes ---------------------------------------------------------------
fastify.get("/api/status", async () => {
  const [installed, gpuAvailable] = await Promise.all([ollamaInstalled(), detectGpu()]);
  const models = installed ? await ollamaModels() : [];
  const dir = getActiveWorkspaceDir();
  const cfg = loadWorkspace(dir);
  return {
    reachable: true,
    ollamaInstalled: installed,
    models,
    gpuAvailable,
    port: PORT,
    workspace: dir,
    activeWorkspace: getActiveWorkspaceName(),
    defaultModel: cfg.model || "llama3",
  };
});

// --- Workspace management -------------------------------------------------
fastify.get("/api/workspaces", async () => ({
  workspaces: listWorkspaces(),
  active: getActiveWorkspaceName(),
}));

fastify.post("/api/workspaces", async (req, reply) => {
  const { name, description, model } = req.body ?? {};
  if (!name?.trim()) return reply.code(400).send({ error: "name required" });
  try {
    const overrides = {};
    if (description) overrides.description = description;
    if (model) overrides.model = model;
    const dir = scaffoldWorkspace(name.trim(), overrides);
    return { ok: true, name: name.trim(), path: dir };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

fastify.put("/api/workspaces/active", async (req, reply) => {
  const { name } = req.body ?? {};
  if (!name?.trim()) return reply.code(400).send({ error: "name required" });
  const available = listWorkspaces().map((w) => w.name);
  if (!available.includes(name.trim())) {
    return reply.code(404).send({ error: `Workspace "${name}" not found` });
  }
  setActiveWorkspaceName(name.trim());
  return { ok: true, active: name.trim() };
});

// --- Workspace file access ------------------------------------------------
fastify.get("/api/workspace", async () => listWorkspaceFiles(getActiveWorkspaceDir()));

fastify.get("/api/file", async (req, reply) => {
  const { path: p } = req.query;
  if (!p) return reply.code(400).send({ error: "path required" });
  try {
    return { path: p, content: readWorkspaceFile(getActiveWorkspaceDir(), p) };
  } catch (e) {
    return reply.code(404).send({ error: e.message });
  }
});

fastify.put("/api/file", async (req, reply) => {
  const { path: p, content } = req.body ?? {};
  if (!p || content === undefined) return reply.code(400).send({ error: "path and content required" });
  try {
    writeWorkspaceFile(getActiveWorkspaceDir(), p, content);
    return { ok: true };
  } catch (e) {
    return reply.code(400).send({ error: e.message });
  }
});

// --- Search & chat --------------------------------------------------------
fastify.post("/api/search", async (req) => {
  const { q, k = 5 } = req.body ?? {};
  return { snippets: searchFTS(getActiveWorkspaceDir(), q ?? "", Number(k)) };
});

fastify.post("/api/chat", async (req, reply) => {
  const dir = getActiveWorkspaceDir();
  const cfg = activeConfig();
  const { task, history = [], model = cfg.model || "llama3" } = req.body ?? {};
  const snippets = task ? searchFTS(dir, task, cfg.retrieval?.topK ?? 5) : [];
  const prompt = assemblePrompt({
    workspaceDir: dir,
    task,
    history,
    snippets,
    tokenBudget: cfg.tokenBudget,
  });

  reply.raw.setHeader("content-type", "application/x-ndjson");
  reply.raw.setHeader("cache-control", "no-cache");
  reply.raw.write(JSON.stringify({ type: "prompt", prompt }) + "\n");

  const installed = await ollamaInstalled();
  if (!installed) {
    const fallback = `[mock] ollama not installed. Prompt assembled with ${snippets.length} snippet(s), ${prompt.tokens.total} tokens.`;
    reply.raw.write(JSON.stringify({ type: "delta", text: fallback }) + "\n");
    reply.raw.write(JSON.stringify({ type: "done", tokensOut: approxTokens(fallback) }) + "\n");
    reply.raw.end();
    return;
  }

  try {
    let acc = "";
    await streamOllama(model, prompt.composed, (chunk) => {
      acc += chunk;
      reply.raw.write(JSON.stringify({ type: "delta", text: chunk }) + "\n");
    });
    reply.raw.write(JSON.stringify({ type: "done", tokensOut: approxTokens(acc) }) + "\n");
  } catch (e) {
    reply.raw.write(JSON.stringify({ type: "error", message: e.message }) + "\n");
  } finally {
    reply.raw.end();
  }
});

// --- Model management -----------------------------------------------------
fastify.post("/api/models/pull", async (req, reply) => {
  const { model } = req.body ?? {};
  if (!model?.trim()) return reply.code(400).send({ error: "model required" });
  reply.raw.setHeader("content-type", "application/x-ndjson");
  reply.raw.setHeader("cache-control", "no-cache");
  const write = (obj) => reply.raw.write(JSON.stringify(obj) + "\n");
  try {
    const sub = execa("ollama", ["pull", model.trim()], { buffer: false });
    sub.stdout.on("data", (b) => write({ type: "progress", text: b.toString("utf8").trim() }));
    sub.stderr.on("data", (b) => write({ type: "progress", text: b.toString("utf8").trim() }));
    await new Promise((resolve, reject) => {
      sub.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exited ${code}`))));
      sub.on("error", reject);
    });
    write({ type: "done" });
  } catch (e) {
    write({ type: "error", message: e.message });
  } finally {
    reply.raw.end();
  }
});

fastify.delete("/api/models/:model", async (req, reply) => {
  const { model } = req.params;
  try {
    await execa("ollama", ["rm", model], { timeout: 10000 });
    return { ok: true };
  } catch (e) {
    return reply.code(500).send({ error: e.message });
  }
});

// --- Git / update ---------------------------------------------------------
fastify.get("/api/git-status", async () => {
  const git = (args) =>
    execa("git", args, { cwd: REPO_ROOT, timeout: 5000 })
      .then(({ stdout }) => stdout.trim())
      .catch(() => "");
  const [branch, commit, commitMsg, subOut] = await Promise.all([
    git(["branch", "--show-current"]),
    git(["rev-parse", "--short", "HEAD"]),
    git(["log", "-1", "--format=%s"]),
    git(["submodule", "status"]),
  ]);
  const submodules = subOut
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([ +\-U]?)([0-9a-f]{40})\s+(\S+)(?:\s+\((.+)\))?/);
      if (!m) return { path: line.trim(), commit: "", status: "unknown", tag: "" };
      const statusMap = { " ": "clean", "": "clean", "+": "updated", "-": "missing", U: "conflict" };
      return { path: m[3], commit: m[2].slice(0, 7), status: statusMap[m[1]] ?? "unknown", tag: m[4] ?? "" };
    });
  return { branch, commit, commitMsg, submodules };
});

fastify.post("/api/update", async (req, reply) => {
  reply.raw.setHeader("content-type", "application/x-ndjson");
  reply.raw.setHeader("cache-control", "no-cache");
  const write = (obj) => reply.raw.write(JSON.stringify(obj) + "\n");

  async function runStep(label, cmd, args, cwd = REPO_ROOT) {
    write({ type: "step", label });
    const sub = execa(cmd, args, { cwd, buffer: false });
    const pipe = (b) => {
      const lines = b.toString("utf8").split("\n").filter(Boolean);
      lines.forEach((l) => write({ type: "line", text: l }));
    };
    sub.stdout?.on("data", pipe);
    sub.stderr?.on("data", pipe);
    await new Promise((resolve, reject) => {
      sub.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
      sub.on("error", reject);
    });
  }

  try {
    await runStep("Fetching remotes…", "git", ["fetch", "--recurse-submodules"]);
    await runStep("Pulling main repo…", "git", ["pull", "--recurse-submodules"]);
    await runStep("Updating submodules to latest…", "git", ["submodule", "update", "--remote", "--merge"]);
    await runStep("npm install (root)…", "npm", ["install"]);
    await runStep("npm install (server)…", "npm", ["install"], path.join(REPO_ROOT, "server"));
    write({ type: "done" });
  } catch (e) {
    write({ type: "error", message: e.message });
  } finally {
    reply.raw.end();
  }
});

// --- Static SPA -----------------------------------------------------------
const distDir = path.resolve(__dirname, "..", "dist");
if (existsSync(distDir)) {
  await fastify.register(fastifyStatic, { root: distDir, prefix: "/" });
  fastify.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
} else {
  fastify.get("/", async (_req, reply) =>
    reply
      .type("text/html")
      .send(
        "<h1>Ollama Chat backend running</h1><p>SPA build not found at <code>../dist</code>. Run <code>npm run build</code> at the repo root.</p>",
      ),
  );
}

// --- Boot -----------------------------------------------------------------
async function bootWithPort(port, attempts = 0) {
  try {
    await fastify.listen({ port, host: "127.0.0.1" });
    return port;
  } catch (e) {
    if (e.code === "EADDRINUSE" && attempts < 10) return bootWithPort(port + 1, attempts + 1);
    throw e;
  }
}

const finalPort = await bootWithPort(PORT);
const url = `http://localhost:${finalPort}`;
fastify.log.info(`Ollama Chat ready at ${url}`);
fastify.log.info(`Active workspace: ${getActiveWorkspaceName()} → ${getActiveWorkspaceDir()}`);
if (process.env.OPEN_BROWSER !== "0") {
  open(url).catch(() => {});
}
