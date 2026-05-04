// Thin client. Tries the real Fastify backend first, falls back to mock.
import type { BackendStatus, ChatMessage, WorkspaceFile } from "./types";

const BASE = "/api";

export async function checkBackend(): Promise<BackendStatus> {
  try {
    const r = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(800) });
    if (!r.ok) throw new Error("bad status");
    return (await r.json()) as BackendStatus;
  } catch {
    return { reachable: false, ollamaInstalled: false, models: [] };
  }
}

export async function fetchWorkspaceFiles(): Promise<WorkspaceFile[]> {
  try {
    const r = await fetch(`${BASE}/workspace`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return [];
    return (await r.json()) as WorkspaceFile[];
  } catch {
    return [];
  }
}

export async function fetchFileContent(path: string): Promise<string> {
  const r = await fetch(`${BASE}/file?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error(`Cannot read ${path}`);
  const json = await r.json() as { content: string };
  return json.content;
}

export async function saveFileContent(path: string, content: string): Promise<void> {
  const r = await fetch(`${BASE}/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!r.ok) throw new Error(`Save failed: ${r.statusText}`);
}

export type PullEvent =
  | { type: "progress"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function* pullModel(model: string): AsyncGenerator<PullEvent> {
  const r = await fetch(`${BASE}/models/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!r.ok || !r.body) throw new Error(`Pull failed: ${r.status}`);
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
      if (line.trim()) yield JSON.parse(line) as PullEvent;
    }
  }
}

export async function deleteModel(model: string): Promise<void> {
  const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`Delete failed: ${r.statusText}`);
}

export async function fetchGitStatus(): Promise<import("./types").GitStatus> {
  const r = await fetch(`${BASE}/git-status`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`git-status failed: ${r.status}`);
  return r.json();
}

export type UpdateEvent =
  | { type: "step"; label: string }
  | { type: "line"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function* streamUpdate(): AsyncGenerator<UpdateEvent> {
  const r = await fetch(`${BASE}/update`, { method: "POST" });
  if (!r.ok || !r.body) throw new Error(`Update failed: ${r.status}`);
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
      if (line.trim()) yield JSON.parse(line) as UpdateEvent;
    }
  }
}

export type NdjsonEvent =
  | { type: "prompt"; prompt: unknown }
  | { type: "delta"; text: string }
  | { type: "done"; tokensOut: number }
  | { type: "error"; message: string };

export async function* chatStream(
  task: string,
  history: ChatMessage[],
  model: string,
): AsyncGenerator<NdjsonEvent> {
  const r = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      model,
    }),
  });
  if (!r.ok || !r.body) throw new Error(`/api/chat returned ${r.status}`);
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
      if (line.trim()) yield JSON.parse(line) as NdjsonEvent;
    }
  }
}
