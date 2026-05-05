// server/lib/workspaceManager.js — workspace lifecycle management.
// Workspaces live at ~/ollama-chat-workspaces/<name>/
// Active workspace is tracked in ~/.config/ollama-chat/config.json

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(__dirname, "../../workspace-template");
export const WORKSPACES_ROOT = process.env.OLLAMA_CHAT_WORKSPACES
  ? path.resolve(process.env.OLLAMA_CHAT_WORKSPACES)
  : path.join(os.homedir(), "ollama-chat-workspaces");
const CONFIG_DIR = path.join(os.homedir(), ".config", "ollama-chat");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function readConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}

function writeConfig(data) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function getActiveWorkspaceName() {
  return readConfig().activeWorkspace ?? "general";
}

export function setActiveWorkspaceName(name) {
  writeConfig({ ...readConfig(), activeWorkspace: name });
}

export function getActiveWorkspaceDir() {
  return path.join(WORKSPACES_ROOT, getActiveWorkspaceName());
}

export function listWorkspaces() {
  if (!existsSync(WORKSPACES_ROOT)) return [];
  return readdirSync(WORKSPACES_ROOT)
    .filter((n) => statSync(path.join(WORKSPACES_ROOT, n)).isDirectory())
    .map((name) => {
      const dir = path.join(WORKSPACES_ROOT, name);
      const cfgPath = path.join(dir, "workspace.json");
      let description = "", model = "";
      if (existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
          description = cfg.description ?? "";
          model = cfg.model ?? "";
        } catch { /* ignore */ }
      }
      return { name, path: dir, description, model };
    });
}

export function scaffoldWorkspace(name, overrides = {}) {
  if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error(`Invalid workspace name: ${name}`);
  const dest = path.join(WORKSPACES_ROOT, name);
  if (existsSync(dest)) throw new Error(`Workspace "${name}" already exists`);
  mkdirSync(WORKSPACES_ROOT, { recursive: true });
  cpSync(TEMPLATE_DIR, dest, { recursive: true });

  // Patch workspace.json with overrides (name, description, model, etc.)
  const cfgPath = path.join(dest, "workspace.json");
  const base = existsSync(cfgPath)
    ? JSON.parse(readFileSync(cfgPath, "utf8"))
    : {};
  writeFileSync(cfgPath, JSON.stringify({ ...base, name, ...overrides }, null, 2), "utf8");
  return dest;
}

export function getWorkspaceDir(name) {
  return path.join(WORKSPACES_ROOT, name);
}

export function getSettings() {
  const cfg = readConfig();
  return {
    workspaceRoot: WORKSPACES_ROOT,
    trustedDirs: cfg.trustedDirs ?? [],
  };
}

export function saveSettings({ trustedDirs = [] } = {}) {
  writeConfig({ ...readConfig(), trustedDirs });
}

export function ensureDefaultWorkspace() {
  const dest = path.join(WORKSPACES_ROOT, "general");
  if (!existsSync(dest)) scaffoldWorkspace("general");
}
