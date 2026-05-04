import { useState, useRef, useEffect } from "react";
import { Download, X, RefreshCw, CheckCircle, AlertCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { pullModel, deleteModel } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onModelAdded: (model: string) => void;
  installedModels: string[];
}

type PullState = "idle" | "pulling" | "done" | "error";

export function PullModelDialog({ open, onClose, onModelAdded, installedModels }: Props) {
  const [modelName, setModelName] = useState("");
  const [state, setState] = useState<PullState>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [deletingModel, setDeletingModel] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

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
      onModelAdded(""); // trigger refresh — caller re-fetches models
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingModel(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            Manage Models
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pull section */}
          <div className="space-y-2">
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
                placeholder="e.g. mistral, llama3.2:3b, phi4"
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
          </div>

          {/* Progress log */}
          {log.length > 0 && (
            <ScrollArea className="h-32 terminal-panel p-3 text-xs">
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

          <Separator />

          {/* Installed models list */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Installed models</p>
            {installedModels.length === 0 ? (
              <p className="text-xs text-muted-foreground">No models installed.</p>
            ) : (
              <ul className="space-y-1">
                {installedModels.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-muted group">
                    <span className="mono text-xs text-foreground">{m}</span>
                    <div className="flex items-center gap-1.5">
                      {m.endsWith(":cloud") && (
                        <span className="chip border border-primary/30 bg-primary/10 text-primary text-[10px]">cloud</span>
                      )}
                      <button
                        onClick={() => handleDelete(m)}
                        disabled={deletingModel === m}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        title={`Remove ${m}`}
                      >
                        {deletingModel === m
                          ? <RefreshCw className="w-3 h-3 animate-spin" />
                          : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
