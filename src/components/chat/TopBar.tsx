import { useEffect, useState } from "react";
import { Cpu, Wifi, WifiOff, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BackendStatus } from "@/lib/types";
import { checkBackend } from "@/lib/api";

interface Props {
  model: string;
  setModel: (m: string) => void;
  onStatus: (s: BackendStatus) => void;
}

export function TopBar({ model, setModel, onStatus }: Props) {
  const [status, setStatus] = useState<BackendStatus>({
    reachable: false,
    ollamaInstalled: false,
    models: ["llama3", "mistral", "phi3", "qwen2.5"],
  });

  useEffect(() => {
    checkBackend().then((s) => {
      const merged: BackendStatus = s.reachable
        ? s
        : { ...s, models: ["llama3 (mock)", "mistral (mock)", "phi3 (mock)"] };
      setStatus(merged);
      onStatus(merged);
    });
  }, [onStatus]);

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/60 backdrop-blur-sm flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-hero flex items-center justify-center shadow-glow">
          <Cpu className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Ollama Chat</h1>
          <p className="text-[10px] mono text-muted-foreground leading-tight">folder-driven · local-first</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 chip border-border bg-card">
          {status.reachable ? (
            <>
              <span className="pulse-dot bg-primary" />
              <span className="text-foreground">connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-warn" />
              <span className="text-warn">mock mode</span>
            </>
          )}
        </div>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="h-9 w-44 mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {status.models.map((m) => (
              <SelectItem key={m} value={m} className="mono text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild variant="outline" size="sm" className="h-9">
          <a
            href="https://github.com/ollama/ollama"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5"
          >
            <Github className="w-3.5 h-3.5" /> docs
          </a>
        </Button>
      </div>
    </header>
  );
}
