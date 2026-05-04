import { useState, useRef, useEffect } from "react";
import {
  Download, RefreshCw, CheckCircle, AlertCircle, Trash2,
  Filter, Plus, X, Pencil, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { pullModel, deleteModel } from "@/lib/api";
import {
  CapDef, CAP_COLORS, COLOR_CLASSES, loadCapDefs, saveCapDefs,
  loadModelCaps, setModelCaps, getModelCaps, inferCaps,
} from "@/lib/capabilities";

interface Props {
  open: boolean;
  onClose: () => void;
  onModelAdded: (model: string) => void;
  installedModels: string[];
}

type PullState = "idle" | "pulling" | "done" | "error";
type Tab = "installed" | "pull" | "caps";

export function PullModelDialog({ open, onClose, onModelAdded, installedModels }: Props) {
  const [tab, setTab] = useState<Tab>("installed");
  const [modelName, setModelName] = useState("");
  const [state, setState] = useState<PullState>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  // Capability filter
  const [filterCap, setFilterCap] = useState<string>("all");

  // Per-model cap editing
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editCaps, setEditCaps] = useState<string[]>([]);

  // Capability type editor (Tab: caps)
  const [capDefs, setCapDefs] = useState<CapDef[]>(() => loadCapDefs());
  const [newCapName, setNewCapName] = useState("");
  const [newCapColor, setNewCapColor] = useState<string>("violet");

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // Reload cap defs whenever dialog opens
  useEffect(() => {
    if (open) setCapDefs(loadCapDefs());
  }, [open]);

  function reset() {
    setState("idle");
    setLog([]);
    setModelName("");
    setErrorMsg("");
  }

  async function handlePull() {
    const name = modelName.trim();
    if (!name) return;
    setState("pulling");
    setLog([`Pulling ${name}…`]);
    setErrorMsg("");
    try {
      for await (const event of pullModel(name)) {
        if (event.type === "progress" && event.text) {
          setLog((l) => [...l, event.text]);
        } else if (event.type === "done") {
          setLog((l) => [...l, `✓ ${name} ready`]);
          setState("done");
          onModelAdded(name);
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
      setState("error");
      setLog((l) => [...l, `✗ ${(e as Error).message}`]);
    }
  }

  async function handleDelete(model: string) {
    setDeletingModel(model);
    try {
      await deleteModel(model);
      onModelAdded("");
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingModel(null);
    }
  }

  function startEditCaps(model: string) {
    setEditingModel(model);
    setEditCaps(getModelCaps(model));
  }

  function toggleEditCap(capId: string) {
    setEditCaps((prev) =>
      prev.includes(capId) ? prev.filter((c) => c !== capId) : [...prev, capId],
    );
  }

  function saveEditCaps() {
    if (!editingModel) return;
    setModelCaps(editingModel, editCaps);
    setEditingModel(null);
  }

  function addCapDef() {
    const id = newCapName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!id || capDefs.find((d) => d.id === id)) return;
    const def: CapDef = { id, label: newCapName.trim(), color: newCapColor };
    const next = [...capDefs, def];
    setCapDefs(next);
    saveCapDefs(next);
    setNewCapName("");
  }

  function removeCapDef(id: string) {
    const next = capDefs.filter((d) => d.id !== id || d.builtIn);
    setCapDefs(next);
    saveCapDefs(next);
  }

  // Filtered model list
  const filteredModels = filterCap === "all"
    ? installedModels
    : installedModels.filter((m) => getModelCaps(m).includes(filterCap));

  // Unique caps across all installed models (for filter bar)
  const allUsedCaps = [...new Set(installedModels.flatMap((m) => getModelCaps(m)))];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Download className="w-4 h-4 text-primary" />
            Manage Models
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b border-border shrink-0 px-5">
          {(["installed", "pull", "caps"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "installed" ? "Installed" : t === "pull" ? "Pull / Add" : "Capabilities"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">

          {/* ── INSTALLED TAB ── */}
          {tab === "installed" && (
            <div className="flex flex-col h-full">
              {/* Capability filter bar */}
              {allUsedCaps.length > 0 && (
                <div className="flex items-center gap-1.5 px-5 py-3 flex-wrap shrink-0 border-b border-border">
                  <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
                  <button
                    onClick={() => setFilterCap("all")}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      filterCap === "all"
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    All ({installedModels.length})
                  </button>
                  {allUsedCaps.map((capId) => {
                    const def = capDefs.find((d) => d.id === capId);
                    if (!def) return null;
                    const cls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.primary;
                    const count = installedModels.filter((m) => getModelCaps(m).includes(capId)).length;
                    return (
                      <button
                        key={capId}
                        onClick={() => setFilterCap(filterCap === capId ? "all" : capId)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          filterCap === capId
                            ? `${cls.border} ${cls.bg} ${cls.text}`
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        {def.label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              <ScrollArea className="flex-1 px-5 py-3">
                {filteredModels.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">
                    {installedModels.length === 0
                      ? "No models installed. Use the Pull tab to download one."
                      : `No models with "${filterCap}" capability.`}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {filteredModels.map((m) => {
                      const caps = getModelCaps(m);
                      const isEditing = editingModel === m;
                      return (
                        <li key={m} className="rounded-lg border border-border bg-card/40 hover:bg-card transition-colors">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <span className="mono text-xs text-foreground flex-1 truncate">{m}</span>
                            {/* Capability badges */}
                            <div className="flex items-center gap-1 shrink-0">
                              {caps.map((capId) => {
                                const def = capDefs.find((d) => d.id === capId);
                                if (!def) return null;
                                const cls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.primary;
                                return (
                                  <span
                                    key={capId}
                                    className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${cls.border} ${cls.bg} ${cls.text}`}
                                  >
                                    {def.label}
                                  </span>
                                );
                              })}
                            </div>
                            {/* Edit caps button */}
                            <button
                              onClick={() => isEditing ? saveEditCaps() : startEditCaps(m)}
                              className={`p-1 rounded transition-colors shrink-0 ${
                                isEditing
                                  ? "text-primary hover:bg-primary/10"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                              title={isEditing ? "Save capabilities" : "Edit capabilities"}
                            >
                              {isEditing ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                            </button>
                            {/* Delete button */}
                            <button
                              onClick={() => handleDelete(m)}
                              disabled={deletingModel === m}
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                              title={`Remove ${m}`}
                            >
                              {deletingModel === m
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>

                          {/* Inline cap editor */}
                          {isEditing && (
                            <div className="px-3 pb-3 border-t border-border/50 pt-2">
                              <p className="text-[10px] text-muted-foreground mb-2">Toggle capabilities:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {capDefs.map((def) => {
                                  const active = editCaps.includes(def.id);
                                  const cls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.primary;
                                  return (
                                    <button
                                      key={def.id}
                                      onClick={() => toggleEditCap(def.id)}
                                      className={`text-[10px] px-2 py-1 rounded border font-medium transition-all ${
                                        active
                                          ? `${cls.border} ${cls.bg} ${cls.text}`
                                          : "border-border text-muted-foreground hover:border-primary/30"
                                      }`}
                                    >
                                      {def.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex gap-2 mt-2">
                                <Button size="sm" className="h-6 text-[10px] px-2" onClick={saveEditCaps}>
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => {
                                    setModelCaps(m, inferCaps(m));
                                    setEditCaps(inferCaps(m));
                                  }}
                                >
                                  Reset to auto-detect
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setEditingModel(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </div>
          )}

          {/* ── PULL TAB ── */}
          {tab === "pull" && (
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Enter any model name from{" "}
                <a
                  href="https://ollama.com/library"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  ollama.com/library
                </a>
                . Cloud models end in <code className="mono text-xs">:cloud</code>.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. mistral, llama3.2:3b, phi4, llava"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && state === "idle" && handlePull()}
                  className="mono text-xs h-9"
                  disabled={state === "pulling"}
                />
                <Button
                  onClick={state === "idle" ? handlePull : reset}
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 text-xs"
                  disabled={state === "pulling" || (!modelName.trim() && state === "idle")}
                  variant={state === "done" || state === "error" ? "outline" : "default"}
                >
                  {state === "pulling" && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {state === "done" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                  {state === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
                  {state === "idle" && <Download className="w-3.5 h-3.5" />}
                  {state === "idle" ? "Pull" : state === "pulling" ? "Pulling…" : "Reset"}
                </Button>
              </div>

              {log.length > 0 && (
                <ScrollArea className="h-32 terminal-panel p-3 text-xs rounded-lg">
                  {log.map((line, i) => (
                    <div key={i} className={`leading-relaxed ${
                      line.startsWith("✓") ? "text-green-400" :
                      line.startsWith("✗") ? "text-red-400" : "opacity-80"
                    }`}>
                      {line}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </ScrollArea>
              )}

              {/* Quick suggestions */}
              <Separator />
              <div>
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">Popular models</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { name: "llama3.1:8b", note: "tools + general" },
                    { name: "llava:7b", note: "vision" },
                    { name: "codestral:22b", note: "code" },
                    { name: "mistral:7b", note: "general" },
                    { name: "phi4:14b", note: "reasoning" },
                    { name: "nomic-embed-text", note: "embeddings" },
                  ].map((s) => (
                    <button
                      key={s.name}
                      onClick={() => { setModelName(s.name); setTab("pull"); }}
                      className="text-left px-2.5 py-2 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                    >
                      <p className="mono text-[10px] font-medium">{s.name}</p>
                      <p className="text-[9px] text-muted-foreground">{s.note}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── CAPABILITIES TAB ── */}
          {tab === "caps" && (
            <ScrollArea className="h-full px-5 py-4">
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Manage capability types. Built-in types cannot be deleted. Custom types can be added with a name and color.
                </p>

                {/* Existing cap defs */}
                <div className="space-y-2">
                  {capDefs.map((def) => {
                    const cls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.primary;
                    return (
                      <div key={def.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card/40">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${cls.swatch}`} />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cls.border} ${cls.bg} ${cls.text}`}>
                          {def.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground mono flex-1">id: {def.id}</span>
                        {def.builtIn ? (
                          <span className="text-[9px] text-muted-foreground">built-in</span>
                        ) : (
                          <button
                            onClick={() => removeCapDef(def.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                            title="Remove capability type"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Separator />

                {/* Add new capability type */}
                <div className="space-y-3">
                  <p className="text-xs font-medium">Add capability type</p>
                  <div className="flex gap-2">
                    <Input
                      value={newCapName}
                      onChange={(e) => setNewCapName(e.target.value)}
                      placeholder="e.g. reasoning, multilingual"
                      className="text-xs h-8 flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") addCapDef(); }}
                    />
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={addCapDef} disabled={!newCapName.trim()}>
                      <Plus className="w-3 h-3" />
                      Add
                    </Button>
                  </div>

                  {/* Color picker */}
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-2">Choose color</p>
                    <div className="flex flex-wrap gap-2">
                      {CAP_COLORS.filter((c) => c !== "primary").map((c) => {
                        const cls = COLOR_CLASSES[c];
                        return (
                          <button
                            key={c}
                            onClick={() => setNewCapColor(c)}
                            title={c}
                            className={`w-6 h-6 rounded-full ${cls.swatch} transition-all ${
                              newCapColor === c
                                ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110"
                                : "opacity-70 hover:opacity-100"
                            }`}
                          />
                        );
                      })}
                    </div>
                    {newCapName.trim() && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Preview:</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                          (COLOR_CLASSES[newCapColor] ?? COLOR_CLASSES.violet).border
                        } ${(COLOR_CLASSES[newCapColor] ?? COLOR_CLASSES.violet).bg} ${
                          (COLOR_CLASSES[newCapColor] ?? COLOR_CLASSES.violet).text
                        }`}>
                          {newCapName.trim().toLowerCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
