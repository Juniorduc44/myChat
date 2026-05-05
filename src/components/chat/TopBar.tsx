import { useEffect, useState } from "react";
import { Cpu, Zap, WifiOff, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import type { BackendStatus } from "@/lib/types";
import { checkBackend } from "@/lib/api";
import { PullModelDialog } from "@/components/config/PullModelDialog";
import { getModelCaps, loadCapDefs, COLOR_CLASSES } from "@/lib/capabilities";

interface Props {
  model: string;
  setModel: (m: string) => void;
  onStatus: (s: BackendStatus) => void;
}

export function TopBar({ model, setModel, onStatus }: Props) {
  const [status, setStatus] = useState<BackendStatus>({
    reachable: false,
    ollamaInstalled: false,
    models: ["llama3 (mock)", "mistral (mock)", "phi3 (mock)"],
    gpuAvailable: false,
  });
  const [pullOpen, setPullOpen] = useState(false);

  function refreshStatus() {
    checkBackend().then((s) => {
      const merged: BackendStatus = s.reachable
        ? s
        : { ...s, models: ["llama3 (mock)", "mistral (mock)", "phi3 (mock)"] };
      setStatus(merged);
      onStatus(merged);
      if (s.reachable && s.models.length > 0 && !s.models.includes(model)) {
        setModel(s.models[0]);
      }
    });
  }

  useEffect(() => {
    refreshStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const HardwareIcon = status.gpuAvailable ? Zap : Cpu;
  const capDefs = loadCapDefs();

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border bg-card/60 backdrop-blur-sm flex items-center justify-between px-5 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-hero flex items-center justify-center shadow-glow">
            <HardwareIcon className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">myChat</h1>
            <p className="text-[10px] mono text-muted-foreground leading-tight">
              local-first · folder-driven · {status.gpuAvailable ? "GPU" : "CPU"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection badge */}
          <div className="hidden sm:flex items-center gap-2 chip border-border bg-card">
            {status.reachable ? (
              <>
                <span className="pulse-dot bg-primary" />
                <span className="text-foreground">connected</span>
                {status.gpuAvailable && (
                  <span className="chip border-primary/40 bg-primary/10 text-primary text-[10px] ml-1">GPU</span>
                )}
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-warn" />
                <span className="text-warn">mock mode</span>
              </>
            )}
          </div>

          {/* Model selector */}
          <Select value={model} onValueChange={(v) => v !== "__pull__" && setModel(v)}>
            <SelectTrigger className="h-9 w-64 mono text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {status.models.map((m) => {
                const info = status.modelDetails?.[m];
                const caps = getModelCaps(m, info?.capabilities ?? []);
                return (
                  <SelectItem key={m} value={m} className="mono text-xs">
                    <span className="flex items-center gap-1.5 w-full">
                      <span className="flex-1 truncate">{m}</span>
                      {info?.paramSize && (
                        <span className="shrink-0 text-[9px] text-muted-foreground">{info.paramSize}</span>
                      )}
                      {caps.map((capId) => {
                        const def = capDefs.find((d) => d.id === capId);
                        if (!def) return null;
                        const cls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.primary;
                        return (
                          <span
                            key={capId}
                            className={`shrink-0 text-[9px] px-1 py-0.5 rounded border font-medium ${cls.border} ${cls.bg} ${cls.text}`}
                          >
                            {def.label}
                          </span>
                        );
                      })}
                    </span>
                  </SelectItem>
                );
              })}
              {status.reachable && (
                <>
                  <SelectSeparator />
                  <div
                    onClick={() => setPullOpen(true)}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary cursor-pointer hover:bg-muted rounded-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Manage / pull model…
                  </div>
                </>
              )}
            </SelectContent>
          </Select>

          {/* Pull button shortcut (always visible) */}
          {status.reachable && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              title="Pull a new model"
              onClick={() => setPullOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          )}

          {/* Ollama docs */}
          <Button asChild variant="outline" size="sm" className="h-9 hidden md:flex">
            <a
              href="https://ollama.com/library"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Models
            </a>
          </Button>
        </div>
      </header>

      <PullModelDialog
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        installedModels={status.models.filter((m) => !m.includes("(mock)"))}
        modelDetails={status.modelDetails}
        onModelAdded={(m) => {
          refreshStatus();
          if (m) setModel(m);
        }}
      />
    </>
  );
}
