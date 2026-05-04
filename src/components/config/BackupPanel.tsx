import { useRef, useState } from "react";
import {
  Archive, Download, Upload, CheckCircle2, AlertCircle,
  Loader2, FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { downloadWorkspaceBackup, restoreWorkspaceBackup } from "@/lib/api";
import type { WorkspaceInfo } from "@/lib/types";

interface Props {
  workspaces: WorkspaceInfo[];
  onRestored: () => void;
}

export function BackupPanel({ workspaces, onRestored }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; names?: string[]; error?: string } | null>(null);

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      const { restored } = await restoreWorkspaceBackup(file);
      setRestoreResult({ ok: true, names: restored });
      onRestored();
    } catch (err) {
      setRestoreResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setRestoring(false);
      // Reset input so the same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Archive className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Workspace Backup &amp; Restore</h2>
            <p className="text-[11px] text-muted-foreground">
              Download zips to back up or migrate your workspace configurations.
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-6 py-5 space-y-8 max-w-xl">

          {/* ── BACKUP SECTION ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Backup
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs gap-1.5"
                onClick={() => downloadWorkspaceBackup()}
                disabled={workspaces.length === 0}
              >
                <Download className="w-3.5 h-3.5" />
                Backup All
              </Button>
            </div>

            {workspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">No workspaces found.</p>
            ) : (
              <ul className="space-y-1.5">
                {workspaces.map((ws) => (
                  <li
                    key={ws.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors group"
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium mono truncate">{ws.name}</p>
                      {ws.description && (
                        <p className="text-[10px] text-muted-foreground truncate">{ws.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => downloadWorkspaceBackup(ws.name)}
                    >
                      <Download className="w-3 h-3" />
                      .zip
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Downloads include CLAUDE.md, CONTEXT.md, templates, snippets, and corpora.
              Sessions are stored in your browser and are not included.
            </p>
          </section>

          <Separator />

          {/* ── RESTORE SECTION ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Restore / Migrate
            </h3>

            <div
              className="rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors p-6 text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  if (fileInputRef.current) {
                    fileInputRef.current.files = dt.files;
                    fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                }
              }}
            >
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Drop a workspace zip here</p>
              <p className="text-[11px] text-muted-foreground mt-1">or click to browse</p>
              <p className="text-[10px] text-muted-foreground mt-2 mono">.zip files only · up to 200 MB</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={handleRestore}
            />

            {restoring && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Extracting…
              </div>
            )}

            {restoreResult && (
              <div
                className={`mt-3 rounded-md px-3 py-2.5 text-xs flex items-start gap-2 ${
                  restoreResult.ok
                    ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20"
                }`}
              >
                {restoreResult.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <span>
                  {restoreResult.ok
                    ? `Restored: ${restoreResult.names?.join(", ") || "workspace(s)"}`
                    : restoreResult.error}
                </span>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              Restoring extracts workspace folders into{" "}
              <code className="mono">~/ollama-chat-workspaces/</code>. Existing workspaces with
              the same name will be overwritten.
            </p>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
