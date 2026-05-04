import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
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
import { chatStream } from "@/lib/api";
import type { ChatMessage as ChatMessageT, AssembledPrompt, ArtifactFile } from "@/lib/types";

interface Props {
  model: string;
  mockMode: boolean;
  initialMessages?: ChatMessageT[];
  onSessionUpdate?: (messages: ChatMessageT[]) => void;
  onFileBlocks?: (files: ArtifactFile[]) => void;
  onRenameSession?: (title: string) => void;
  sessionTitle?: string;
}

export function ChatPanel({
  model,
  mockMode,
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

  // Rename dialog state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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

  async function send() {
    const task = input.trim();
    if (!task || busy) return;

    const mockPrompt = assemblePrompt(task, messages);
    setLastPrompt(mockPrompt);

    const userMsg: ChatMessageT = {
      id: crypto.randomUUID(),
      role: "user",
      content: task,
      tokensIn: mockTokenCount(task),
      createdAt: Date.now(),
      prompt: mockPrompt,
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
        for await (const event of chatStream(task, messages, model)) {
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
        <div className="flex gap-3 items-end max-w-4xl mx-auto">
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
          <Button onClick={send} disabled={busy || !input.trim()} size="lg" className="h-[60px] px-5">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
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
          <h2 className="text-2xl font-semibold tracking-tight">The folder is memory.</h2>
          <p className="text-sm text-muted-foreground">The prompt is direction. They work together.</p>
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
