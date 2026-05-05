import { useEffect, useRef, useState } from "react";
import {
  Zap, ListChecks, ChevronLeft, Send, Loader2, Save,
  Check, AlertCircle, FileText, Bot, WrenchIcon, CircleAlert,
  FolderOpen, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { wsBuilderStream, createWorkspace, switchWorkspace, saveFileContent, checkModelToolsSupport } from "@/lib/api";
import { parseFileBlocks } from "@/components/chat/ArtifactPanel";
import type { ArtifactFile } from "@/lib/types";

type Mode = "select" | "auto" | "manual";
interface Msg { role: "user" | "assistant"; content: string; }
interface ToolProgress { filename: string; done: boolean; }

interface Props {
  models: string[];
  onCreated: (name: string) => void;
  onCancel: () => void;
}

export function WorkspaceCreatorPanel({ models, onCreated, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>("select");
  const [autoPrompt, setAutoPrompt] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [files, setFiles] = useState<ArtifactFile[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [wsName, setWsName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Tool support state
  const [toolsSupported, setToolsSupported] = useState<boolean | null>(null); // null = checking
  const [toolProgress, setToolProgress] = useState<ToolProgress[]>([]);
  const [toolSummary, setToolSummary] = useState("");

  // Confirmation overlay shown after workspace is written to disk
  const [confirm, setConfirm] = useState<{
    name: string; path: string; files: string[]; summary: string;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const liveModel = models.find((m) => !m.includes("(mock)")) ?? "";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveText, toolProgress]);

  // Check tool support when a real model is available
  useEffect(() => {
    if (!liveModel) { setToolsSupported(false); return; }
    setToolsSupported(null);
    checkModelToolsSupport(liveModel).then(setToolsSupported);
  }, [liveModel]);

  // Kick off manual mode welcome + first question
  useEffect(() => {
    if (mode === "manual" && messages.length === 0) {
      // For tool mode, need workspace name first — don't auto-kickoff until name is set
      if (toolsSupported === false || (toolsSupported && wsName)) {
        runBuilder("", [], "manual");
      }
    }
  }, [mode, toolsSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runBuilder(task: string, history: Msg[], builderMode: "auto" | "manual") {
    setStreaming(true);
    setLiveText("");
    setToolProgress([]);
    let acc = "";
    let autoSaved = false;
    const autoSavedMeta = { path: "", files: [] as string[], summary: "" };

    try {
      const nameToUse = toolsSupported ? wsName : undefined;
      for await (const ev of wsBuilderStream(task, history, liveModel, builderMode, nameToUse)) {
        if (ev.type === "delta") {
          acc += ev.text;
          setLiveText(acc);
        } else if (ev.type === "workspace_created") {
          // Workspace dir was created on server — update our local name state
          setWsName(ev.name);
        } else if (ev.type === "tool_call") {
          setToolProgress((prev) => [...prev, { filename: ev.filename, done: false }]);
        } else if (ev.type === "tool_done") {
          setToolProgress((prev) =>
            prev.map((p) => p.filename === ev.filename ? { ...p, done: true } : p),
          );
        } else if (ev.type === "workspace_saved") {
          setToolSummary(ev.summary ?? "");
          autoSaved = true;
          // Capture path and files for the confirmation overlay
          Object.assign(autoSavedMeta, {
            path: ev.path ?? "",
            files: ev.files ?? [],
            summary: ev.summary ?? "",
          });
        } else if (ev.type === "done" || ev.type === "error") {
          break;
        }
      }
    } finally {
      setStreaming(false);
      setLiveText("");

      if (autoSaved) {
        setSaved(true);
        try { await switchWorkspace(wsName); } catch { /* already active or just created */ }
        setConfirm({ name: wsName, ...autoSavedMeta });
        return;
      }

      if (acc) {
        const reply: Msg = { role: "assistant", content: acc };
        setMessages((prev) => [...prev, reply]);

        const blocks = parseFileBlocks(acc);
        if (blocks.length > 0) {
          setFiles(blocks);
          setActiveFile(blocks[0].filename);
          const cfg = blocks.find((b) => b.filename === "workspace.json");
          if (cfg) {
            try { const j = JSON.parse(cfg.content); if (j.name) setWsName(j.name); } catch { /* ignore */ }
          }
        }
      }
    }
  }

  async function handleGenerate() {
    if (!autoPrompt.trim() || streaming) return;
    if (toolsSupported && !wsName.trim()) return; // name required in tool mode
    const userMsg: Msg = { role: "user", content: autoPrompt.trim() };
    setMessages([userMsg]);
    setFiles([]);
    setToolProgress([]);
    setToolSummary("");
    setSaved(false);
    await runBuilder(autoPrompt.trim(), [], "auto");
  }

  async function handleManualSend() {
    if (!chatInput.trim() || streaming) return;
    const userMsg: Msg = { role: "user", content: chatInput.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setChatInput("");
    await runBuilder(chatInput.trim(), next, "manual");
  }

  async function handleSave() {
    const name = wsName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
    if (!name || files.length === 0) return;
    setSaving(true);
    setSaveError("");
    try {
      await createWorkspace(name);
      await switchWorkspace(name);
      for (const f of files) await saveFileContent(f.filename, f.content);
      setSaved(true);
      setConfirm({
        name,
        path: `~/ollama-chat-workspaces/${name}`,
        files: files.map((f) => f.filename),
        summary: "",
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  function startManualWithName() {
    if (!wsName.trim()) return;
    setMessages([]);
    runBuilder("", [], "manual");
  }

  function reset() {
    setMode("select");
    setMessages([]);
    setFiles([]);
    setLiveText("");
    setAutoPrompt("");
    setChatInput("");
    setWsName("");
    setSaved(false);
    setSaveError("");
    setToolProgress([]);
    setToolSummary("");
  }

  // ── MODE SELECTOR ──────────────────────────────────────────────────────
  if (mode === "select") {
    return (
      <div className="flex flex-col h-full p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={onCancel} className="p-1 rounded hover:bg-muted transition-colors -ml-1">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-semibold">Create Workspace</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-8">
          Choose how you'd like to build your workspace. The AI uses the Clief Notes 1.3 framework.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMode("auto")}
            className="group flex flex-col gap-3 p-5 rounded-xl border-2 border-border hover:border-primary/50 bg-card hover:bg-primary/5 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Auto-Gen</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Describe your project in one prompt. The AI generates all workspace files instantly.
              </p>
            </div>
            <div className="text-[10px] text-primary font-medium mt-auto">
              Best for: quick setup, clear project ideas
            </div>
          </button>

          <button
            onClick={() => setMode("manual")}
            className="group flex flex-col gap-3 p-5 rounded-xl border-2 border-border hover:border-primary/50 bg-card hover:bg-primary/5 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <ListChecks className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Manual / Guided</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                The AI walks you through each section step by step with a numbered template.
              </p>
            </div>
            <div className="text-[10px] text-primary font-medium mt-auto">
              Best for: custom setups, understanding the structure
            </div>
          </button>
        </div>

        <div className="mt-8 p-4 rounded-lg border border-dashed border-border bg-muted/20">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">How it works:</span>{" "}
            The AI generates CLAUDE.md (identity), CONTEXT.md (project background),
            workspace.json (config), and optionally templates/default.prompt (output format)
            — only including files the workspace actually needs per the 1.3 framework.
            You review and edit before saving.
          </p>
        </div>
      </div>
    );
  }

  // ── SHARED CREATOR VIEW (AUTO + MANUAL) ────────────────────────────────
  const isToolMode = toolsSupported === true;
  const toolsChecking = toolsSupported === null;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Confirmation overlay */}
      {confirm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md mx-6 rounded-xl border border-primary/30 bg-card shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">Workspace created!</p>
                <p className="text-xs text-muted-foreground mono mt-0.5">{confirm.name}</p>
              </div>
            </div>

            {/* Path */}
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground font-medium mb-1">Location on disk</p>
              <div className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                <code className="mono text-xs text-foreground truncate flex-1">
                  {confirm.path || `~/ollama-chat-workspaces/${confirm.name}`}
                </code>
              </div>
            </div>

            {/* Files written */}
            {confirm.files.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Files written ({confirm.files.length})
                </p>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {confirm.files.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs">
                      <Check className="w-3 h-3 text-primary shrink-0" />
                      <span className="mono text-foreground truncate">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary */}
            {confirm.summary && (
              <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                {confirm.summary}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 gap-2"
                onClick={() => { setConfirm(null); onCreated(confirm.name); }}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Open Workspace
              </Button>
              <Button
                variant="outline"
                className="shrink-0 text-xs"
                onClick={() => setConfirm(null)}
              >
                Keep building
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-border">
        <button onClick={reset} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold">
          {mode === "auto" ? "Auto-Gen Workspace" : "Guided Workspace Setup"}
        </h2>
        <span className="chip border-primary/30 bg-primary/10 text-primary text-[10px]">AI</span>

        {/* Tool support badge */}
        {toolsChecking && (
          <span className="ml-auto chip border-border bg-muted text-muted-foreground text-[10px] flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 animate-spin" /> checking model…
          </span>
        )}
        {isToolMode && !toolsChecking && (
          <span className="ml-auto chip border-primary/30 bg-primary/10 text-primary text-[10px] flex items-center gap-1">
            <WrenchIcon className="w-2.5 h-2.5" /> tool mode — files auto-saved
          </span>
        )}
        {toolsSupported === false && !toolsChecking && liveModel && (
          <span className="ml-auto chip border-warn/40 bg-warn/10 text-warn text-[10px] flex items-center gap-1">
            <CircleAlert className="w-2.5 h-2.5" /> copy/paste mode
          </span>
        )}
      </div>

      {/* Non-tool-mode warning banner */}
      {toolsSupported === false && !toolsChecking && liveModel && (
        <div className="shrink-0 px-5 py-2.5 border-b border-warn/20 bg-warn/5 flex items-start gap-2">
          <CircleAlert className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
          <p className="text-[11px] text-warn leading-relaxed">
            <strong>{liveModel}</strong> does not support tool calling. The AI will display the generated files as text — you'll need to review and click <strong>Save Workspace</strong> to write them to disk. To get automatic file creation, switch to a tool-capable model (e.g. <code className="mono">llama3.1:8b</code>).
          </p>
        </div>
      )}

      {/* Auto-gen: workspace name + prompt input (before first generate) */}
      {mode === "auto" && messages.length === 0 && !saved && (
        <div className="shrink-0 px-5 py-4 border-b border-border space-y-3">
          <p className="text-xs text-muted-foreground">
            Describe your project. The AI will decide which files are needed and generate them.
          </p>

          {/* Workspace name — required upfront in tool mode */}
          {isToolMode && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground w-32 shrink-0">Workspace name</label>
              <Input
                value={wsName}
                onChange={(e) =>
                  setWsName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, ""))
                }
                placeholder="e.g. linkedin-cybersecurity"
                className="font-mono text-sm h-8 max-w-xs"
              />
              <span className="text-[10px] text-muted-foreground">required for auto-save</span>
            </div>
          )}

          <Textarea
            value={autoPrompt}
            onChange={(e) => setAutoPrompt(e.target.value)}
            placeholder="e.g. A LinkedIn post creation tool focused on cybersecurity. I want to produce 3 posts per week on topics like zero-day vulnerabilities, secure coding, and threat intelligence. Posts should be professional but approachable, ending with a call to action and 5 relevant hashtags."
            className="min-h-[100px] text-sm resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={!autoPrompt.trim() || (isToolMode && !wsName.trim())}
              className="gap-2"
            >
              <Zap className="w-4 h-4" />
              Generate Workspace
            </Button>
            {isToolMode && !wsName.trim() && (
              <p className="text-[10px] text-warn">Enter a workspace name above first</p>
            )}
            {!isToolMode && (
              <p className="text-[10px] text-muted-foreground">⌘↵ to generate</p>
            )}
          </div>
        </div>
      )}

      {/* Manual mode: workspace name required before Q&A when tool mode */}
      {mode === "manual" && messages.length === 0 && isToolMode && !streaming && (
        <div className="shrink-0 px-5 py-4 border-b border-border space-y-3">
          <p className="text-xs text-muted-foreground">
            In tool mode, choose a workspace name before we start — the AI will write files directly when it's done with the Q&A.
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={wsName}
              onChange={(e) =>
                setWsName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, ""))
              }
              placeholder="e.g. linkedin-cybersecurity"
              className="font-mono text-sm h-8 max-w-xs"
              onKeyDown={(e) => { if (e.key === "Enter") startManualWithName(); }}
              autoFocus
            />
            <Button
              size="sm"
              onClick={startManualWithName}
              disabled={!wsName.trim()}
              className="gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Start Setup
            </Button>
          </div>
        </div>
      )}

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
        <div className="space-y-4 max-w-3xl pb-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && (
                <div className="shrink-0 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm max-w-[75%]"
                    : "glass-panel rounded-tl-sm max-w-[90%]"
                }`}
              >
                <WsMarkdown text={m.content} />
              </div>
            </div>
          ))}

          {/* Live streaming bubble */}
          {streaming && (
            <div className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                {liveText ? (
                  <Bot className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                )}
              </div>
              <div className="glass-panel rounded-xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed max-w-[90%]">
                {liveText
                  ? <WsMarkdown text={liveText} />
                  : <span className="text-muted-foreground text-xs animate-pulse">Thinking…</span>
                }
              </div>
            </div>
          )}

          {/* Tool progress panel */}
          {toolProgress.length > 0 && (
            <div className="glass-panel rounded-xl px-4 py-3 max-w-sm space-y-1.5">
              <p className="text-[11px] font-semibold text-primary mb-2 flex items-center gap-1.5">
                <WrenchIcon className="w-3 h-3" />
                Writing workspace files…
              </p>
              {toolProgress.map((p) => (
                <div key={p.filename} className="flex items-center gap-2 text-xs">
                  {p.done ? (
                    <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
                  )}
                  <span className={`mono ${p.done ? "text-foreground" : "text-muted-foreground"}`}>
                    {p.filename}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tool summary / done state */}
          {saved && isToolMode && (
            <div className="glass-panel rounded-xl px-4 py-3 max-w-sm flex items-center gap-2 border border-primary/20">
              <Check className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary">Workspace created!</p>
                {toolSummary && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{toolSummary}</p>
                )}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Manual chat input */}
      {mode === "manual" && (!isToolMode || messages.length > 0) && !saved && (
        <div className="shrink-0 px-5 py-3 border-t border-border">
          <div className="flex gap-2 max-w-3xl">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleManualSend(); } }}
              placeholder="Your answer…"
              className="text-sm"
              disabled={streaming}
              autoFocus={messages.length > 0}
            />
            <Button
              onClick={handleManualSend}
              disabled={streaming || !chatInput.trim()}
              size="sm"
              className="shrink-0 gap-1.5"
            >
              {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </Button>
          </div>
        </div>
      )}

      {/* Generated files + save section — only shown in non-tool mode */}
      {files.length > 0 && !isToolMode && (
        <div className="shrink-0 border-t border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 px-5 pt-3 pb-1">
            <FileText className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">Generated Files</span>
            <span className="chip border-primary/20 bg-primary/10 text-primary text-[10px]">{files.length}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Review and edit before saving</span>
          </div>

          <Tabs value={activeFile} onValueChange={setActiveFile}>
            <TabsList className="mx-5 h-8 bg-transparent gap-0.5 justify-start border-b border-border rounded-none w-auto">
              {files.map((f) => (
                <TabsTrigger
                  key={f.filename}
                  value={f.filename}
                  className="text-[10px] mono h-7 px-2.5 data-[state=active]:bg-background data-[state=active]:shadow-none rounded-t-md"
                >
                  {f.filename.split("/").pop()}
                </TabsTrigger>
              ))}
            </TabsList>
            {files.map((f) => (
              <TabsContent key={f.filename} value={f.filename} className="mt-0 p-0">
                <textarea
                  value={f.content}
                  onChange={(e) =>
                    setFiles((prev) =>
                      prev.map((p) => p.filename === f.filename ? { ...p, content: e.target.value } : p),
                    )
                  }
                  className="w-full h-36 px-5 py-3 font-mono text-xs bg-transparent resize-none focus:outline-none border-b border-border"
                  spellCheck={false}
                />
              </TabsContent>
            ))}
          </Tabs>

          <div className="px-5 py-3 flex items-center gap-3">
            <Input
              value={wsName}
              onChange={(e) =>
                setWsName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, ""))
              }
              placeholder="workspace-name"
              className="font-mono text-sm h-8 w-48"
            />
            <Button
              onClick={handleSave}
              disabled={saving || saved || !wsName.trim()}
              size="sm"
              className="gap-1.5"
            >
              {saved ? (
                <><Check className="w-3.5 h-3.5" /> Saved!</>
              ) : saving ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-3.5 h-3.5" /> Save Workspace</>
              )}
            </Button>
            {saveError && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {saveError}
              </span>
            )}
            {!saveError && !saved && files.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Will create and switch to this workspace
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Markdown renderer with circled-number highlighting for Manual mode blanks
function WsMarkdown({ text }: { text: string }) {
  const display = text.replace(/(?:~~~|```)\s*file:[^\s\n]+[\s\S]*?(?:~~~|```)/g, "").trim();
  if (!display) return null;

  const blocks = display.split(/\n\n+/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.startsWith("```") || b.startsWith("~~~")) {
          const code = b.replace(/^(?:```|~~~)\w*\n?/, "").replace(/(?:```|~~~)$/, "");
          return (
            <pre key={i} className="terminal-panel p-3 text-xs overflow-x-auto rounded-lg">
              <code>{code}</code>
            </pre>
          );
        }
        if (b.startsWith("| ")) {
          return (
            <pre key={i} className="text-xs font-mono whitespace-pre-wrap opacity-80">{b}</pre>
          );
        }
        if (b.startsWith("# ")) {
          return <p key={i} className="font-bold text-base">{b.slice(2)}</p>;
        }
        if (b.startsWith("## ")) {
          return <p key={i} className="font-semibold text-sm mt-1">{b.slice(3)}</p>;
        }
        if (b.startsWith("### ")) {
          return <p key={i} className="font-semibold text-xs mt-1 text-muted-foreground uppercase tracking-wide">{b.slice(4)}</p>;
        }
        return (
          <p
            key={i}
            className="text-sm leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: inlineWs(b) }}
          />
        );
      })}
    </div>
  );
}

function inlineWs(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="mono px-1 py-0.5 rounded bg-muted text-foreground text-[0.85em]">$1</code>')
    .replace(
      /([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬])/g,
      '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold mx-0.5">$1</span>',
    )
    .replace(
      /\[([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬][^\]]*)\]/g,
      '<span class="px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 font-mono text-[0.85em]">[$1]</span>',
    );
}
