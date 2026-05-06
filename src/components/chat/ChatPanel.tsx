import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, Paperclip, X, FileText, AlertCircle, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChatMessage } from "./ChatMessage";
import { TokenStats } from "./TokenStats";
import { PromptInspector } from "./PromptInspector";
import { parseFileBlocks } from "./ArtifactPanel";
import { assemblePrompt, mockStream, mockTokenCount } from "@/lib/mockOllama";
import { chatStream, uploadAttachment } from "@/lib/api";
import { hasCapability } from "@/lib/capabilities";
import type { ChatMessage as ChatMessageT, AssembledPrompt, ArtifactFile, Attachment } from "@/lib/types";

interface Props {
  model: string;
  mockMode: boolean;
  ollamaCaps?: string[];
  initialMessages?: ChatMessageT[];
  onSessionUpdate?: (messages: ChatMessageT[]) => void;
  onFileBlocks?: (files: ArtifactFile[]) => void;
  onRenameSession?: (title: string) => void;
  sessionTitle?: string;
}

const ACCEPTED_TYPES = ".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp";

export function ChatPanel({
  model,
  mockMode,
  ollamaCaps = [],
  initialMessages = [],
  onSessionUpdate,
  onFileBlocks,
  onRenameSession,
  sessionTitle = "",
}: Props) {
  const [messages, setMessages] = useState<ChatMessageT[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<AssembledPrompt | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Browser-harness skill toggle
  const [browserHarnessOn, setBrowserHarnessOn] = useState(false);
  const modelSupportsTools = hasCapability(model, "tools", ollamaCaps);

  // Rename dialog
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const modelSupportsVision = hasCapability(model, "vision", ollamaCaps);
  const hasImageAttachment = attachments.some((a) => a.type === "image");
  const visionWarning = hasImageAttachment && !modelSupportsVision && !mockMode;

  function updateMessages(updater: (prev: ChatMessageT[]) => ChatMessageT[]) {
    setMessages((prev) => {
      const next = updater(prev);
      onSessionUpdate?.(next);
      return next;
    });
  }

  // --- Message actions ---
  function handleDelete(id: string) {
    updateMessages((prev) => prev.filter((m) => m.id !== id));
  }

  function handleDuplicate(id: string) {
    updateMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx === -1) return prev;
      const copy: ChatMessageT = { ...prev[idx], id: crypto.randomUUID(), createdAt: Date.now() };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }

  function handleSaveAs(msg: ChatMessageT) {
    const header = `# ${msg.role === "user" ? "User" : "Assistant"} message\n\n`;
    const blob = new Blob([header + msg.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `message-${msg.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openRename() {
    setRenameValue(sessionTitle);
    setRenameOpen(true);
  }

  function commitRename() {
    const t = renameValue.trim();
    if (t) onRenameSession?.(t);
    setRenameOpen(false);
  }

  // --- File upload ---
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";

    setUploading(true);
    try {
      for (const file of files) {
        // Handle txt/md client-side for speed
        if (file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".txt")) {
          const content = await file.text();
          const att: Attachment = {
            id: crypto.randomUUID(),
            name: file.name,
            type: "text",
            content,
            mimeType: file.type || "text/plain",
            sizeBytes: file.size,
          };
          setAttachments((prev) => [...prev, att]);
        } else {
          // PDF and images → server-side
          const att = await uploadAttachment(file);
          setAttachments((prev) => [...prev, att]);
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // --- Send ---
  async function send() {
    const task = input.trim();
    if ((!task && attachments.length === 0) || busy) return;

    const mockPrompt = assemblePrompt(task, messages);
    setLastPrompt(mockPrompt);

    const snap = [...attachments];
    setAttachments([]);

    const userMsg: ChatMessageT = {
      id: crypto.randomUUID(),
      role: "user",
      content: task,
      tokensIn: mockTokenCount(task),
      createdAt: Date.now(),
      prompt: mockPrompt,
      attachments: snap.length > 0 ? snap : undefined,
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessageT = {
      id: assistantId,
      role: "assistant",
      content: "",
      tokensOut: 0,
      createdAt: Date.now(),
    };

    updateMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setBusy(true);

    let acc = "";
    try {
      function emitFileBlocks(text: string) {
        if (!onFileBlocks) return;
        const blocks = parseFileBlocks(text);
        if (blocks.length > 0) onFileBlocks(blocks);
      }

      if (mockMode) {
        for await (const chunk of mockStream(mockPrompt, model)) {
          acc += chunk;
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, content: acc, tokensOut: mockTokenCount(acc) } : m),
          );
        }
        setMessages((prev) => {
          const next = prev.map((m) => m.id === assistantId ? { ...m, content: acc } : m);
          onSessionUpdate?.(next);
          return next;
        });
        emitFileBlocks(acc);
      } else {
        for await (const event of chatStream(task, messages, model, snap, browserHarnessOn)) {
          if (event.type === "prompt") {
            setLastPrompt(event.prompt as AssembledPrompt);
          } else if (event.type === "delta") {
            acc += event.text;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: acc, tokensOut: mockTokenCount(acc) } : m),
            );
          } else if (event.type === "done") {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === assistantId ? { ...m, tokensOut: event.tokensOut } : m,
              );
              onSessionUpdate?.(next);
              return next;
            });
            emitFileBlocks(acc);
          } else if (event.type === "error") {
            acc += `\n\n⚠️ ${event.message}`;
            setMessages((prev) => {
              const next = prev.map((m) => m.id === assistantId ? { ...m, content: acc } : m);
              onSessionUpdate?.(next);
              return next;
            });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !busy;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <EmptyState mockMode={mockMode} model={model} onExample={setInput} />
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              onInspect={() => {
                if (m.prompt) {
                  setLastPrompt(m.prompt);
                  setInspectorOpen(true);
                }
              }}
              onDelete={() => handleDelete(m.id)}
              onDuplicate={() => handleDuplicate(m.id)}
              onSaveAs={() => handleSaveAs(m)}
              onRename={onRenameSession ? openRename : undefined}
            />
          ))
        )}
      </div>

      {lastPrompt && <TokenStats prompt={lastPrompt} onOpen={() => setInspectorOpen(true)} />}

      <div className="border-t border-border bg-card/60 backdrop-blur-sm px-6 py-4">
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Vision warning */}
          {visionWarning && (
            <div className="flex items-center gap-2 text-[11px] text-warn px-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>{model}</strong> doesn't support vision. Switch to a vision-capable model (e.g. llava) to use image attachments.
              </span>
            </div>
          )}

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {attachments.map((att) => (
                <AttachmentChip key={att.id} att={att} onRemove={() => removeAttachment(att.id)} />
              ))}
              {uploading && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> uploading…
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3 items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Paperclip button */}
            <Button
              variant="outline"
              size="sm"
              className="h-[60px] w-10 p-0 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
              title="Attach file (PDF, TXT, MD, image)"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </Button>

            {/* Browser-harness skill toggle */}
            <Button
              variant={browserHarnessOn ? "default" : "outline"}
              size="sm"
              className="h-[60px] w-10 p-0 shrink-0"
              onClick={() => setBrowserHarnessOn((v) => !v)}
              disabled={busy || mockMode || !modelSupportsTools}
              title={
                mockMode
                  ? "Browser skill unavailable in mock mode"
                  : !modelSupportsTools
                  ? "Browser skill requires a tools-capable model (e.g. llama3.1)"
                  : browserHarnessOn
                  ? "Browser skill ON — click to disable"
                  : "Enable browser skill (uses browser-harness)"
              }
            >
              <Globe2 className="w-4 h-4" />
            </Button>

            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask anything — the folder is loaded. ⏎ to send, ⇧⏎ for newline."
                className="min-h-[60px] max-h-[200px] resize-none font-sans pr-20 bg-background"
                disabled={busy}
              />
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground mono">
                {mockTokenCount(input)} tok
              </span>
            </div>
            <Button onClick={send} disabled={!canSend} size="lg" className="h-[60px] px-5">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      <PromptInspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} prompt={lastPrompt} />

      {/* Rename chat dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
            className="text-sm"
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={commitRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttachmentChip({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const isImage = att.type === "image";
  const label = att.name.length > 24 ? att.name.slice(0, 22) + "…" : att.name;
  const size = att.sizeBytes < 1024
    ? `${att.sizeBytes}B`
    : att.sizeBytes < 1024 * 1024
    ? `${(att.sizeBytes / 1024).toFixed(0)}KB`
    : `${(att.sizeBytes / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <div className="group flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-md border border-border bg-muted/60 text-[10px] text-muted-foreground max-w-[200px]">
      {isImage ? (
        <img src={att.content} alt={att.name} className="w-5 h-5 rounded object-cover shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
          {att.type === "pdf"
            ? <FileText className="w-3 h-3 text-primary" />
            : <FileText className="w-3 h-3 text-muted-foreground" />}
        </div>
      )}
      <span className="truncate flex-1">{label}</span>
      <span className="shrink-0 opacity-60">{size}</span>
      <button
        onClick={onRemove}
        className="shrink-0 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
        title="Remove attachment"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function EmptyState({
  mockMode,
  model,
  onExample,
}: {
  mockMode: boolean;
  model: string;
  onExample: (text: string) => void;
}) {
  const examples = [
    "Summarize the five-part prompt framework",
    "Explain folder-driven context in two paragraphs",
    "Draft a README section about retrieval",
    "List constraints from CLAUDE.md",
  ];

  return (
    <div className="max-w-2xl mx-auto py-12 animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center shadow-glow">
          <Sparkles className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">myChat</h2>
          <p className="text-sm text-muted-foreground">The folder is memory. The prompt is direction.</p>
        </div>
      </div>
      <p className="text-muted-foreground mb-6 leading-relaxed">
        Workspace loaded. Every prompt is auto-assembled from your{" "}
        <code className="mono text-foreground">CLAUDE.md</code> (identity),{" "}
        <code className="mono text-foreground">CONTEXT.md</code> (project), and top-K retrieved snippets
        from <code className="mono text-foreground">corpora/</code> with{" "}
        <span className="text-provenance">file:line provenance</span>. Running on{" "}
        <code className="mono text-foreground">{model}</code>
        {mockMode && (
          <span className="ml-1 chip border-warn/40 bg-warn/10 text-warn">mock mode</span>
        )}.
      </p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-4 px-1">
        <Paperclip className="w-3.5 h-3.5" />
        Attach PDFs, text files, and images with the paperclip button below.
        {" "}Images require a vision-capable model (e.g. llava, llama3.2-vision).
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="text-left px-4 py-3 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-soft transition-all text-sm group"
          >
            <span className="text-primary mono mr-2 group-hover:text-primary-glow transition-colors">›</span>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
