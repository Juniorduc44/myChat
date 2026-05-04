// Thin client. Tries the real Fastify backend first, falls back to mock.
import type { BackendStatus } from "./types";

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
