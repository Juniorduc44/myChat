// server/index.js — Fastify entry point.
// Local-first. Shells to the `ollama` CLI via execa. Falls back to mock mode
// when ollama is missing so the app always works on first launch.
//
// Routes:
//   GET  /api/status        — backend + ollama health, available models
//   GET  /api/workspace     — list workspace files
//   GET  /api/file?path=…   — read a workspace file
//   POST /api/search        — FTS5 retrieval { q, k } -> snippets[]
//   POST /api/chat          — { task, history, model } -> NDJSON stream
//   GET  /                  — serves the built SPA (../dist)

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { execa } from "execa";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import open from "open";

import { loadWorkspace, listWorkspaceFiles, readWorkspaceFile } from "./lib/workspace.js";
import { searchFTS } from "./lib/retrieval.js";
import { assemblePrompt, approxTokens } from "./lib/prompt-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WORKSPACE_DIR =
  process.env.OLLAMA_CHAT_WORKSPACE ||
  path.join(os.homedir(), "ollama-chat-workspace");

const config = loadWorkspace(WORKSPACE_DIR);
const PORT = Number(process.env.PORT || config.port || 3000);
const DEFAULT_MODEL = config.model || "llama3";

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

// Streams ollama generation. Uses `ollama run --nowordwrap` and pipes stdout.
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

// --- Routes ---------------------------------------------------------------
fastify.get("/api/status", async () => {
  const installed = await ollamaInstalled();
  const models = installed ? await ollamaModels() : [];
  return {
    reachable: true,
    ollamaInstalled: installed,
    models,
    port: PORT,
    workspace: WORKSPACE_DIR,
    defaultModel: DEFAULT_MODEL,
  };
});

fastify.get("/api/workspace", async () => listWorkspaceFiles(WORKSPACE_DIR));

fastify.get("/api/file", async (req, reply) => {
  const { path: p } = req.query;
  if (!p) return reply.code(400).send({ error: "path required" });
  try {
    return { path: p, content: readWorkspaceFile(WORKSPACE_DIR, p) };
  } catch (e) {
    return reply.code(404).send({ error: e.message });
  }
});

fastify.post("/api/search", async (req) => {
  const { q, k = 5 } = req.body ?? {};
  return { snippets: searchFTS(WORKSPACE_DIR, q ?? "", Number(k)) };
});

fastify.post("/api/chat", async (req, reply) => {
  const { task, history = [], model = DEFAULT_MODEL } = req.body ?? {};
  const snippets = task ? searchFTS(WORKSPACE_DIR, task, config.retrieval?.topK ?? 5) : [];
  const prompt = assemblePrompt({
    workspaceDir: WORKSPACE_DIR,
    task,
    history,
    snippets,
    tokenBudget: config.tokenBudget,
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
fastify.log.info(`Workspace: ${WORKSPACE_DIR}`);
if (process.env.OPEN_BROWSER !== "0") {
  open(url).catch(() => {});
}
