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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import open from "open";

import {
  ensureDefaultWorkspace,
  getActiveWorkspaceName,
  setActiveWorkspaceName,
  getActiveWorkspaceDir,
  getWorkspaceDir,
  listWorkspaces,
  scaffoldWorkspace,
  getSettings,
  saveSettings,
  WORKSPACES_ROOT,
} from "./lib/workspaceManager.js";
import { loadWorkspace, listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from "./lib/workspace.js";
import { searchFTS } from "./lib/retrieval.js";
import { assemblePrompt, approxTokens } from "./lib/prompt-assembler.js";
import { streamWorkspaceZip, restoreWorkspaceZip } from "./lib/backup.js";
import { buildWsBuilderPrompt, buildWsBuilderMessages, WS_BUILDER_TOOLS } from "./lib/ws-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

// Ensure a default workspace exists before we need it
ensureDefaultWorkspace();

const PORT = Number(process.env.PORT || 3000);

const fastify = Fastify({ logger: { transport: { target: "pino-pretty" } } });
await fastify.register(fastifyCors, { origin: true });
await fastify.register((await import("@fastify/multipart")).default, {
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max zip upload
});

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

// REST-based streaming chat — supports images field for vision models.
async function ollamaChatStreamRest(model, messages, onChunk) {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) throw new Error(`Ollama REST chat error: ${r.status}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.message?.content) onChunk(ev.message.content);
        if (ev.done) return ev.eval_count ?? 0;
      } catch { /* skip malformed */ }
    }
  }
  return 0;
}

// Fetch per-model metadata from Ollama REST API (capabilities, size, paramSize, etc.)
async function fetchOllamaModelDetails() {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return {};
    const data = await r.json();
    const models = data.models ?? [];
    const details = {};
    await Promise.all(
      models.map(async (m) => {
        const name = m.name;
        const isCloud = name.endsWith(":cloud");
        const sizeGB = (!isCloud && m.size) ? +(m.size / 1e9).toFixed(1) : undefined;
        const paramSize = m.details?.parameter_size;
        const family = m.details?.family;
        const quantization = m.details?.quantization_level;
        let capabilities = [];
        try {
          const sr = await fetch(`${OLLAMA_HOST}/api/show`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name }),
            signal: AbortSignal.timeout(4000),
          });
          if (sr.ok) {
            const sd = await sr.json();
            capabilities = (sd.capabilities ?? []).filter((c) => c !== "completion");
          }
        } catch { /* show failed — leave caps empty */ }
        details[name] = { capabilities, sizeGB, paramSize, family, quantization, isCloud };
      }),
    );
    return details;
  } catch {
    return {};
  }
}

// Check whether a model advertises the "tools" capability via Ollama REST API.
async function checkModelSupportsTools(model) {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return false;
    const data = await r.json();
    return Array.isArray(data.capabilities) && data.capabilities.includes("tools");
  } catch {
    return false;
  }
}

// Browser-harness skill tool definition
const BROWSER_HARNESS_TOOL = {
  type: "function",
  function: {
    name: "run_browser_harness",
    description:
      "Execute browser automation Python code via the browser-harness CLI. All helpers (new_tab, wait_for_load, capture_screenshot, click_at_xy, js, page_info, http_get, etc.) are pre-imported. Use new_tab(url) for first navigation; goto_url only for subsequent navigations in the same tab. print() output is captured as the tool result.",
    parameters: {
      type: "object",
      required: ["code"],
      properties: {
        code: {
          type: "string",
          description:
            "Python code to execute. Multi-line OK. Call print() to return information to the model. Example:\n  new_tab('https://example.com')\n  wait_for_load()\n  print(page_info())",
        },
      },
    },
  },
};

// Agentic chat loop with browser-harness tool support.
async function runChatWithBrowserHarness(prompt, history, task, model, reply) {
  const write = (obj) => reply.raw.write(JSON.stringify(obj) + "\n");

  const systemContent =
    prompt.composed +
    "\n\nYou have access to a live browser via the `run_browser_harness` tool. Use it to look up current information, browse websites, or verify facts when needed. After each tool call, reason about the output before responding.";

  const messages = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: task },
  ];

  for (let i = 0; i < 20; i++) {
    let res;
    try {
      res = await ollamaChatNoStream(model, messages, [BROWSER_HARNESS_TOOL]);
    } catch (e) {
      write({ type: "error", message: e.message });
      return;
    }

    const msg = res.message;
    messages.push(msg);

    // No tool calls → final answer
    if (!msg.tool_calls?.length) {
      if (msg.content) write({ type: "delta", text: msg.content });
      write({ type: "done", tokensOut: res.eval_count ?? 0 });
      return;
    }

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      const { name, arguments: args } = tc.function;
      if (name === "run_browser_harness") {
        const { code } = args;
        write({ type: "tool_call", tool: "browser_harness", filename: "browser" });
        try {
          const result = await execa("browser-harness", ["-c", code], { timeout: 60_000 });
          const output = [result.stdout, result.stderr ? `[stderr]: ${result.stderr}` : ""]
            .filter(Boolean)
            .join("\n")
            .trim();
          write({ type: "tool_result", text: output || "(no output)" });
          messages.push({ role: "tool", content: JSON.stringify({ ok: true, output }) });
        } catch (e) {
          const errMsg = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").trim();
          write({ type: "tool_result", text: `Error: ${errMsg}` });
          messages.push({ role: "tool", content: JSON.stringify({ ok: false, error: errMsg }) });
        }
        write({ type: "tool_done", tool: "browser_harness", filename: "browser" });
      }
    }
  }

  write({ type: "error", message: "Browser harness loop reached max iterations without finishing." });
}

// Single non-streaming Ollama chat request (for tool-calling agentic loop).
async function ollamaChatNoStream(model, messages, tools) {
  const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, tools, stream: false }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`Ollama /api/chat error: ${r.status}`);
  return r.json();
}

// Agentic loop: runs the workspace-builder with tool calls and writes files to disk.
async function runWsBuilderWithTools(workspaceName, wsDir, model, messages, reply) {
  const write = (obj) => reply.raw.write(JSON.stringify(obj) + "\n");
  let wsCreated = false;
  const writtenFiles = [];
  const loopMessages = [...messages];

  for (let i = 0; i < 30; i++) {
    let res;
    try {
      res = await ollamaChatNoStream(model, loopMessages, WS_BUILDER_TOOLS);
    } catch (e) {
      write({ type: "error", message: e.message });
      return;
    }

    const msg = res.message;
    loopMessages.push(msg);

    // No tool calls — final text response
    if (!msg.tool_calls?.length) {
      if (msg.content) write({ type: "delta", text: msg.content });
      write({ type: "done", tokensOut: res.eval_count ?? 0 });
      return;
    }

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      const { name, arguments: args } = tc.function;

      if (name === "write_workspace_file") {
        const { filename, content } = args;

        // Lazily scaffold workspace on first write
        if (!wsCreated) {
          try {
            scaffoldWorkspace(workspaceName, {});
          } catch {
            // Already exists — fine, we'll overwrite files
          }
          wsCreated = true;
          write({ type: "workspace_created", name: workspaceName });
        }

        write({ type: "tool_call", tool: "write_workspace_file", filename });

        try {
          const fullPath = path.join(wsDir, filename);
          mkdirSync(path.dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf8");
          writtenFiles.push(filename);
          write({ type: "tool_done", tool: "write_workspace_file", filename });
          loopMessages.push({ role: "tool", content: JSON.stringify({ ok: true, path: filename }) });
        } catch (e) {
          write({ type: "error", message: `Failed to write ${filename}: ${e.message}` });
          loopMessages.push({ role: "tool", content: JSON.stringify({ ok: false, error: e.message }) });
        }
      } else if (name === "finish_workspace") {
        const { summary } = args;
        write({ type: "workspace_saved", name: workspaceName, path: wsDir, files: writtenFiles, summary });
        write({ type: "done", tokensOut: res.eval_count ?? 0 });
        return;
      }
    }
  }

  write({ type: "error", message: "Tool loop reached max iterations without finishing." });
}

// Helper: get active workspace config at request-time
function activeConfig() {
  const dir = getActiveWorkspaceDir();
  return loadWorkspace(dir);
}

// --- Routes ---------------------------------------------------------------
fastify.get("/api/status", async () => {
  const [installed, gpuAvailable, modelDetails] = await Promise.all([
    ollamaInstalled(), detectGpu(), fetchOllamaModelDetails(),
  ]);
  const detailKeys = Object.keys(modelDetails);
  const models = installed
    ? (detailKeys.length > 0 ? detailKeys : await ollamaModels())
    : [];
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
    modelDetails,
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

// --- Workspace backup & restore -------------------------------------------
// GET /api/workspaces/backup?name=foo  — download foo.zip
// GET /api/workspaces/backup           — download all-workspaces.zip
fastify.get("/api/workspaces/backup", async (req, reply) => {
  const { name } = req.query;
  try {
    await streamWorkspaceZip(reply, name || null);
  } catch (e) {
    if (!reply.raw.headersSent) reply.code(404).send({ error: e.message });
  }
});

// POST /api/workspaces/restore — upload a backup zip (multipart field "file")
fastify.post("/api/workspaces/restore", async (req, reply) => {
  let data;
  try {
    data = await req.file();
  } catch {
    return reply.code(400).send({ error: "Expected multipart file upload" });
  }
  if (!data) return reply.code(400).send({ error: "No file provided" });
  try {
    const restored = await restoreWorkspaceZip(data.file);
    return { ok: true, restored };
  } catch (e) {
    return reply.code(500).send({ error: e.message });
  }
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

// --- Model capabilities ---------------------------------------------------
// GET /api/models/capabilities?model=llama3.1:8b
fastify.get("/api/models/capabilities", async (req, reply) => {
  const { model } = req.query;
  if (!model?.trim()) return reply.code(400).send({ error: "model required" });
  const installed = await ollamaInstalled();
  if (!installed) return { tools: false, capabilities: [], reason: "ollama_not_installed" };
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/show`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: model.trim() }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { tools: false, capabilities: [], model: model.trim() };
    const data = await r.json();
    const capabilities = (data.capabilities ?? []).filter((c) => c !== "completion");
    return { tools: capabilities.includes("tools"), capabilities, model: model.trim() };
  } catch {
    return { tools: false, capabilities: [], model: model.trim() };
  }
});

// --- App settings (workspace root + trusted directories) ------------------
fastify.get("/api/settings", async () => getSettings());

fastify.put("/api/settings", async (req, reply) => {
  const { trustedDirs } = req.body ?? {};
  if (!Array.isArray(trustedDirs)) return reply.code(400).send({ error: "trustedDirs must be an array" });
  saveSettings({ trustedDirs: trustedDirs.filter((d) => typeof d === "string" && d.trim()) });
  return { ok: true };
});

// --- Workspace builder (AI-assisted workspace creation) -------------------
// POST /api/ws-builder
// Body: { task, history: [{role,content}], model, mode: "auto"|"manual", workspaceName? }
//
// If model supports tools AND workspaceName is provided → agentic loop writes files to disk.
// Otherwise → stream text with file blocks for manual copy/save.
fastify.post("/api/ws-builder", async (req, reply) => {
  const { task = "", history = [], model, mode = "auto", workspaceName } = req.body ?? {};
  const cfg = activeConfig();
  const selectedModel = model || cfg.model || "llama3.1:8b";

  reply.raw.setHeader("content-type", "application/x-ndjson");
  reply.raw.setHeader("cache-control", "no-cache");

  const installed = await ollamaInstalled();
  if (!installed) {
    const mock = "[mock] ollama not installed — workspace builder requires a running Ollama instance.";
    reply.raw.write(JSON.stringify({ type: "delta", text: mock }) + "\n");
    reply.raw.write(JSON.stringify({ type: "done", tokensOut: approxTokens(mock) }) + "\n");
    reply.raw.end();
    return;
  }

  // Tool-calling path: model supports tools + workspace name provided
  const supportsTools = workspaceName ? await checkModelSupportsTools(selectedModel) : false;

  if (supportsTools && workspaceName) {
    const wsDir = getWorkspaceDir(workspaceName);
    const messages = buildWsBuilderMessages(task, history, mode, workspaceName);
    try {
      await runWsBuilderWithTools(workspaceName, wsDir, selectedModel, messages, reply);
    } catch (e) {
      reply.raw.write(JSON.stringify({ type: "error", message: e.message }) + "\n");
    } finally {
      reply.raw.end();
    }
    return;
  }

  // Streaming text path (non-tool models or no workspace name yet)
  const composed = buildWsBuilderPrompt(task, history, mode);
  try {
    let acc = "";
    await streamOllama(selectedModel, composed, (chunk) => {
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

// --- File upload (attachments) --------------------------------------------
// POST /api/upload — multipart "file" field
// Returns: { type: "text"|"image", name, content, mimeType, sizeBytes }
fastify.post("/api/upload", async (req, reply) => {
  let data;
  try {
    data = await req.file();
  } catch {
    return reply.code(400).send({ error: "Expected multipart file upload" });
  }
  if (!data) return reply.code(400).send({ error: "No file provided" });

  const name = data.filename;
  const mime = data.mimetype;
  const chunks = [];
  for await (const chunk of data.file) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  // Image files — return base64 data URL
  if (mime.startsWith("image/")) {
    const b64 = buf.toString("base64");
    return {
      type: "image",
      name,
      content: `data:${mime};base64,${b64}`,
      mimeType: mime,
      sizeBytes: buf.length,
    };
  }

  // PDF — extract text
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      return {
        type: "pdf",
        name,
        content: result.text,
        mimeType: mime,
        sizeBytes: buf.length,
      };
    } catch (e) {
      return reply.code(500).send({ error: `PDF extraction failed: ${e.message}` });
    }
  }

  // Plain text / markdown — decode as UTF-8
  return {
    type: "text",
    name,
    content: buf.toString("utf8"),
    mimeType: mime,
    sizeBytes: buf.length,
  };
});

// --- Search & chat --------------------------------------------------------
fastify.post("/api/search", async (req) => {
  const { q, k = 5 } = req.body ?? {};
  return { snippets: searchFTS(getActiveWorkspaceDir(), q ?? "", Number(k)) };
});

fastify.post("/api/chat", async (req, reply) => {
  const dir = getActiveWorkspaceDir();
  const cfg = activeConfig();
  const { task, history = [], model = cfg.model || "llama3", attachments = [], browserHarness = false } = req.body ?? {};

  // Prepend text/pdf attachment content to the task
  let augmentedTask = task;
  const imageAttachments = attachments.filter((a) => a.type === "image");
  const textAttachments = attachments.filter((a) => a.type !== "image");
  if (textAttachments.length > 0) {
    const contextBlocks = textAttachments
      .map((a) => `## Attached: ${a.name}\n\n\`\`\`\n${a.content}\n\`\`\``)
      .join("\n\n");
    augmentedTask = contextBlocks + (task ? `\n\n${task}` : "");
  }

  const snippets = augmentedTask ? searchFTS(dir, augmentedTask, cfg.retrieval?.topK ?? 5) : [];
  const prompt = assemblePrompt({
    workspaceDir: dir,
    task: augmentedTask,
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

  // Browser-harness agentic path
  if (browserHarness && installed) {
    const supportsTools = await checkModelSupportsTools(model);
    if (supportsTools) {
      try {
        await runChatWithBrowserHarness(prompt, history, augmentedTask || task, model, reply);
      } catch (e) {
        reply.raw.write(JSON.stringify({ type: "error", message: e.message }) + "\n");
      } finally {
        reply.raw.end();
      }
      return;
    }
    // Model doesn't support tools — fall through to regular streaming with a warning in the prompt
    reply.raw.write(
      JSON.stringify({
        type: "delta",
        text: `⚠️ Browser skill requires a tools-capable model. **${model}** doesn't support tool calls — continuing without browser access.\n\n`,
      }) + "\n",
    );
  }

  try {
    let acc = "";
    if (imageAttachments.length > 0) {
      // Vision path: use Ollama REST API with images field
      const images = imageAttachments.map((a) => a.content.replace(/^data:[^;]+;base64,/, ""));
      const restMessages = [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: prompt.composed, images },
      ];
      const tokensOut = await ollamaChatStreamRest(model, restMessages, (chunk) => {
        acc += chunk;
        reply.raw.write(JSON.stringify({ type: "delta", text: chunk }) + "\n");
      });
      reply.raw.write(JSON.stringify({ type: "done", tokensOut }) + "\n");
    } else {
      // CLI streaming path (faster for text-only)
      await streamOllama(model, prompt.composed, (chunk) => {
        acc += chunk;
        reply.raw.write(JSON.stringify({ type: "delta", text: chunk }) + "\n");
      });
      reply.raw.write(JSON.stringify({ type: "done", tokensOut: approxTokens(acc) }) + "\n");
    }
  } catch (e) {
    reply.raw.write(JSON.stringify({ type: "error", message: e.message }) + "\n");
  } finally {
    reply.raw.end();
  }
});

// --- Browser-harness -------------------------------------------------------
// POST /api/browser-harness/launch — open Chrome to chrome://inspect so the
// user can click Allow and enable DevTools access for browser-harness.
fastify.post("/api/browser-harness/launch", async (_req, reply) => {
  const candidates = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"];
  for (const bin of candidates) {
    try {
      // --new-window forces a visible window; chrome://inspect is where Allow lives
      execa(bin, ["--new-window", "chrome://inspect"], { detached: true, stdio: "ignore" });
      return { ok: true, browser: bin };
    } catch {
      // try next candidate
    }
  }
  // Last resort: let the `open` package handle it
  try {
    await open("chrome://inspect");
    return { ok: true, browser: "system-default" };
  } catch (e) {
    return reply.code(500).send({ error: `Could not open Chrome: ${e.message}` });
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
