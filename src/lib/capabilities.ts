// src/lib/capabilities.ts — model capability definitions, auto-inference, and user overrides.

export interface CapDef {
  id: string;
  label: string;
  color: string;    // one of the CAP_COLORS keys
  builtIn?: boolean;
}

export const CAP_COLORS = [
  "violet", "blue", "green", "amber", "rose", "cyan", "orange", "teal", "pink", "indigo", "primary",
] as const;
export type CapColor = typeof CAP_COLORS[number];

// Tailwind utility classes for each color (border, bg, text)
export const COLOR_CLASSES: Record<string, { border: string; bg: string; text: string; swatch: string }> = {
  violet: { border: "border-violet-400/40",  bg: "bg-violet-400/10",  text: "text-violet-400",  swatch: "bg-violet-500" },
  blue:   { border: "border-blue-400/40",    bg: "bg-blue-400/10",    text: "text-blue-400",    swatch: "bg-blue-500" },
  green:  { border: "border-green-400/40",   bg: "bg-green-400/10",   text: "text-green-400",   swatch: "bg-green-500" },
  amber:  { border: "border-amber-400/40",   bg: "bg-amber-400/10",   text: "text-amber-500",   swatch: "bg-amber-500" },
  rose:   { border: "border-rose-400/40",    bg: "bg-rose-400/10",    text: "text-rose-400",    swatch: "bg-rose-500" },
  cyan:   { border: "border-cyan-400/40",    bg: "bg-cyan-400/10",    text: "text-cyan-400",    swatch: "bg-cyan-500" },
  orange: { border: "border-orange-400/40",  bg: "bg-orange-400/10",  text: "text-orange-400",  swatch: "bg-orange-500" },
  teal:   { border: "border-teal-400/40",    bg: "bg-teal-400/10",    text: "text-teal-400",    swatch: "bg-teal-500" },
  pink:   { border: "border-pink-400/40",    bg: "bg-pink-400/10",    text: "text-pink-400",    swatch: "bg-pink-500" },
  indigo: { border: "border-indigo-400/40",  bg: "bg-indigo-400/10",  text: "text-indigo-400",  swatch: "bg-indigo-500" },
  primary:{ border: "border-primary/40",     bg: "bg-primary/10",     text: "text-primary",     swatch: "bg-primary" },
};

export const BUILTIN_CAPS: CapDef[] = [
  { id: "tools",    label: "tools",    color: "violet",  builtIn: true },
  { id: "thinking", label: "thinking", color: "amber",   builtIn: true },
  { id: "vision",   label: "vision",   color: "blue",    builtIn: true },
  { id: "code",     label: "code",     color: "green",   builtIn: true },
  { id: "cloud",    label: "cloud",    color: "primary", builtIn: true },
  { id: "embed",    label: "embed",    color: "teal",    builtIn: true },
];

const CAPS_DEFS_KEY = "mychat-cap-defs";
const MODEL_CAPS_KEY = "mychat-model-caps";

export function loadCapDefs(): CapDef[] {
  try {
    const stored = localStorage.getItem(CAPS_DEFS_KEY);
    const custom: CapDef[] = stored ? JSON.parse(stored) : [];
    return [...BUILTIN_CAPS, ...custom];
  } catch {
    return [...BUILTIN_CAPS];
  }
}

export function saveCapDefs(defs: CapDef[]) {
  const custom = defs.filter((d) => !d.builtIn);
  localStorage.setItem(CAPS_DEFS_KEY, JSON.stringify(custom));
}

// Per-model overrides: { [modelName]: string[] } — list of cap IDs
export function loadModelCaps(): Record<string, string[]> {
  try {
    const stored = localStorage.getItem(MODEL_CAPS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setModelCaps(model: string, caps: string[]) {
  const all = loadModelCaps();
  all[model] = caps;
  localStorage.setItem(MODEL_CAPS_KEY, JSON.stringify(all));
}

// Pattern sets for name-based inference
const VISION_NAMES = ["llava", "bakllava", "moondream", "cogvlm", "minicpm-v", "qwen-vl", "llama3.2-vision", "phi3-vision", "phi-3-vision", "gemma3", "granite3-vision", "minicpm", "internvl"];
const CODE_NAMES   = ["code", "codestral", "deepseek-coder", "starcoder", "codegemma", "codellama", "phind-codellama", "wizard-coder"];
const EMBED_NAMES  = ["embed", "nomic-embed", "mxbai-embed", "snowflake-arctic-embed", "all-minilm"];

export function inferCaps(modelName: string, ollamaCaps: string[] = []): string[] {
  const n = modelName.toLowerCase();
  const caps: string[] = [];

  if (ollamaCaps.includes("tools")) caps.push("tools");
  if (ollamaCaps.includes("thinking")) caps.push("thinking");
  if (ollamaCaps.includes("vision")) caps.push("vision");

  if (n.endsWith(":cloud")) caps.push("cloud");

  if (!caps.includes("vision") && VISION_NAMES.some((v) => n.includes(v))) caps.push("vision");
  if (CODE_NAMES.some((c) => n.includes(c))) caps.push("code");
  if (EMBED_NAMES.some((e) => n.includes(e))) caps.push("embed");

  return [...new Set(caps)];
}

// Merged: user overrides take priority over inferred
export function getModelCaps(modelName: string, ollamaCaps: string[] = []): string[] {
  const overrides = loadModelCaps();
  if (overrides[modelName] !== undefined) return overrides[modelName];
  return inferCaps(modelName, ollamaCaps);
}

export function hasCapability(modelName: string, capId: string, ollamaCaps: string[] = []): boolean {
  return getModelCaps(modelName, ollamaCaps).includes(capId);
}
