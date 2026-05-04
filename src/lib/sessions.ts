import type { ChatSession, ChatMessage } from "./types";

const MAX_SESSIONS = 100;

function key(workspace: string) {
  return `ollama-chat-sessions-${workspace}`;
}

export function loadSessions(workspace: string): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem(key(workspace)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveSession(session: ChatSession, workspace: string): void {
  const all = loadSessions(workspace).filter((s) => s.id !== session.id);
  localStorage.setItem(key(workspace), JSON.stringify([session, ...all].slice(0, MAX_SESSIONS)));
}

export function deleteSession(id: string, workspace: string): void {
  const all = loadSessions(workspace).filter((s) => s.id !== id);
  localStorage.setItem(key(workspace), JSON.stringify(all));
}

export function newSession(model: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Chat",
    model,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function sessionTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New Chat";
  return first.content.slice(0, 60) + (first.content.length > 60 ? "…" : "");
}

export function groupSessionsByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const now = Date.now();
  const DAY = 86_400_000;
  const groups: Record<string, ChatSession[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };
  for (const s of sessions) {
    const age = now - s.updatedAt;
    if (age < DAY) groups["Today"].push(s);
    else if (age < 2 * DAY) groups["Yesterday"].push(s);
    else if (age < 7 * DAY) groups["This week"].push(s);
    else groups["Older"].push(s);
  }
  return groups;
}
