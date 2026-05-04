import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, GitBranch, GitCommit, CheckCircle, AlertCircle,
  Package, ArrowUpCircle, Wifi, GitFork,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { fetchGitStatus, streamUpdate } from "@/lib/api";
import type { GitStatus } from "@/lib/types";

type UpdateState = "idle" | "running" | "done" | "error";

interface LogLine {
  kind: "step" | "line" | "error" | "ok";
  text: string;
}

export function UpdatePanel({ mockMode }: { mockMode: boolean }) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  useEffect(() => {
    if (mockMode) { setLoadingStatus(false); return; }
    fetchGitStatus()
      .then(setGitStatus)
      .catch(() => setGitStatus(null))
      .finally(() => setLoadingStatus(false));
  }, [mockMode]);

  async function runUpdate() {
    setUpdateState("running");
    setLog([]);
    try {
      for await (const event of streamUpdate()) {
        if (event.type === "step") {
          setLog((l) => [...l, { kind: "step", text: event.label }]);
        } else if (event.type === "line") {
          setLog((l) => [...l, { kind: "line", text: event.text }]);
        } else if (event.type === "done") {
          setLog((l) => [...l, { kind: "ok", text: "Update complete. Restart the server to apply changes." }]);
          setUpdateState("done");
          // Refresh git status after update
          fetchGitStatus().then(setGitStatus).catch(() => {});
        } else if (event.type === "error") {
          setLog((l) => [...l, { kind: "error", text: event.message }]);
          setUpdateState("error");
        }
      }
    } catch (e) {
      setLog((l) => [...l, { kind: "error", text: (e as Error).message }]);
      setUpdateState("error");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-hero flex items-center justify-center shadow-glow">
            <ArrowUpCircle className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">System Update</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pull latest from GitHub, update submodules, reinstall deps.
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-6 space-y-6 max-w-2xl">

          {/* Git status card */}
          <div className="glass-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="w-4 h-4 text-primary" />
              Repository Status
            </div>

            {mockMode ? (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-warn" />
                Connect the backend to view git status.
              </p>
            ) : loadingStatus ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : gitStatus ? (
              <div className="space-y-2">
                <Row icon={GitBranch} label="Branch" value={gitStatus.branch} />
                <Row icon={GitCommit} label="Commit" value={gitStatus.commit} />
                {gitStatus.commitMsg && (
                  <Row icon={GitCommit} label="Message" value={gitStatus.commitMsg} dim />
                )}
                {gitStatus.submodules.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Submodules
                    </p>
                    {gitStatus.submodules.map((sub) => (
                      <div key={sub.path} className="flex items-center gap-2 text-xs">
                        <GitFork className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="mono text-foreground flex-1 truncate">{sub.path}</span>
                        <span className="mono text-muted-foreground shrink-0">{sub.commit}</span>
                        <StatusBadge status={sub.status} />
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-destructive">Could not read git status.</p>
            )}
          </div>

          {/* What gets updated */}
          <div className="glass-panel p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Package className="w-4 h-4 text-primary" />
              What "Update" does
            </div>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
              <li><code className="mono text-foreground">git fetch --recurse-submodules</code> — fetch all remotes</li>
              <li><code className="mono text-foreground">git pull --recurse-submodules</code> — merge latest changes</li>
              <li><code className="mono text-foreground">git submodule update --remote --merge</code> — bring <span className="text-foreground">tools/browser-harness</span> to latest upstream commit</li>
              <li><code className="mono text-foreground">npm install</code> (root + server) — sync any new deps</li>
            </ol>
            <p className="text-xs text-muted-foreground pt-1">
              After updating, <strong className="text-foreground">restart the server</strong> for changes to take effect.
              The frontend rebuilds on the next <code className="mono">npm run build</code>.
            </p>
          </div>

          {/* Update button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={runUpdate}
              disabled={updateState === "running" || mockMode}
              size="lg"
              className="gap-2"
            >
              {updateState === "running" ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : updateState === "done" ? (
                <CheckCircle className="w-4 h-4" />
              ) : updateState === "error" ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <ArrowUpCircle className="w-4 h-4" />
              )}
              {updateState === "idle" && "Pull Updates"}
              {updateState === "running" && "Updating…"}
              {updateState === "done" && "Up to Date"}
              {updateState === "error" && "Retry Update"}
            </Button>
            {updateState !== "idle" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => { setUpdateState("idle"); setLog([]); }}
              >
                Clear log
              </Button>
            )}
          </div>

          {/* Progress log */}
          {log.length > 0 && (
            <div className="terminal-panel p-4 text-xs space-y-0.5 max-h-72 overflow-y-auto">
              {log.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.kind === "step"
                      ? "text-primary font-semibold mt-2 first:mt-0"
                      : line.kind === "ok"
                      ? "text-green-400 font-semibold mt-2"
                      : line.kind === "error"
                      ? "text-red-400"
                      : "opacity-70"
                  }
                >
                  {line.kind === "step" ? `▶ ${line.text}` : line.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  dim,
}: {
  icon: typeof GitBranch;
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className={`mono truncate ${dim ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    clean: "bg-primary/10 text-primary border-primary/20",
    updated: "bg-warn/10 text-warn border-warn/20",
    missing: "bg-destructive/10 text-destructive border-destructive/20",
    conflict: "bg-destructive/10 text-destructive border-destructive/20",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`chip border text-[10px] ${styles[status] ?? styles.unknown}`}>{status}</span>
  );
}
