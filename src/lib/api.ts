// Thin client. Tries the real Fastify backend first, falls back to mock.
import type { BackendStatus, ChatMessage, WorkspaceFile, WorkspaceListResponse } from "./types";

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

export async function checkModelToolsSupport(model: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/models/capabilities?model=${encodeURIComponent(model)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return false;
    const data = await r.json() as { tools: boolean };
    return data.tools === true;
  } catch {
    return false;
  }
}

export async function* wsBuilderStream(
  task: string,
  history: { role: string; content: string }[],
  model: string,
  mode: "auto" | "manual" = "auto",
  workspaceName?: string,
): AsyncGenerator<NdjsonEvent> {
  const r = await fetch(`${BASE}/ws-builder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task, history, model, mode, workspaceName }),
  });
  if (!r.ok || !r.body) throw new Error(`/api/ws-builder returned ${r.status}`);
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

export async function fetchWorkspaceList(): Promise<WorkspaceListResponse> {
  const r = await fetch(`${BASE}/workspaces`, { signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error(`workspaces fetch failed: ${r.status}`);
  return r.json() as Promise<WorkspaceListResponse>;
}

export async function createWorkspace(
  name: string,
  opts: { description?: string; model?: string } = {},
): Promise<void> {
  const r = await fetch(`${BASE}/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, ...opts }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
}

export async function switchWorkspace(name: string): Promise<void> {
  const r = await fetch(`${BASE}/workspaces/active`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
}

// Download a workspace zip. name=undefined means all workspaces.
export function downloadWorkspaceBackup(name?: string): void {
  const url = name
    ? `${BASE}/workspaces/backup?name=${encodeURIComponent(name)}`
    : `${BASE}/workspaces/backup`;
  const a = document.createElement("a");
  a.href = url;
  a.download = name ? `ollama-chat-${name}.zip` : "ollama-chat-all-workspaces.zip";
  a.click();
}

export async function restoreWorkspaceBackup(file: File): Promise<{ restored: string[] }> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`${BASE}/workspaces/restore`, { method: "POST", body: form });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
  return r.json() as Promise<{ restored: string[] }>;
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
  | { type: "error"; message: string }
  | { type: "workspace_created"; name: string }
  | { type: "tool_call"; tool: string; filename: string }
  | { type: "tool_done"; tool: string; filename: string }
  | { type: "workspace_saved"; name: string; summary: string };

export async function uploadAttachment(file: File): Promise<import("./types").Attachment> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string };
    throw new Error(err.error ?? r.statusText);
  }
  const data = await r.json() as { type: string; name: string; content: string; mimeType: string; sizeBytes: number };
  return {
    id: crypto.randomUUID(),
    name: data.name,
    type: data.type as "text" | "image" | "pdf",
    content: data.content,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
  };
}

export async function* chatStream(
  task: string,
  history: ChatMessage[],
  model: string,
  attachments: import("./types").Attachment[] = [],
): AsyncGenerator<NdjsonEvent> {
  const r = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      model,
      attachments: attachments.map((a) => ({ type: a.type, name: a.name, content: a.content })),
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
