import { useEffect, useState } from "react";
import { FolderOpen, Plus, Trash2, Shield, HardDrive, FolderLock, Terminal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchSettings, saveSettings } from "@/lib/api";
import type { AppSettings } from "@/lib/types";

interface Props {
  mockMode: boolean;
}

export function SettingsPanel({ mockMode }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ workspaceRoot: "", trustedDirs: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDir, setNewDir] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mockMode) { setLoading(false); return; }
    fetchSettings().then((s) => { setSettings(s); setLoading(false); });
  }, [mockMode]);

  async function handleAddDir() {
    const dir = newDir.trim();
    if (!dir) return;
    if (settings.trustedDirs.includes(dir)) { setError("Already in list"); return; }
    const next = { ...settings, trustedDirs: [...settings.trustedDirs, dir] };
    setSettings(next);
    setNewDir("");
    setError("");
    await persist(next);
  }

  async function handleRemoveDir(dir: string) {
    const next = { ...settings, trustedDirs: settings.trustedDirs.filter((d) => d !== dir) };
    setSettings(next);
    await persist(next);
  }

  async function persist(s: AppSettings) {
    setSaving(true);
    try { await saveSettings({ trustedDirs: s.trustedDirs }); }
    catch { /* silent — show stale UI */ }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Settings
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure storage paths and AI access permissions.
          </p>
        </div>

        {/* Workspace Storage */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace Storage</h3>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Root directory</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 mono text-xs bg-muted/60 rounded px-3 py-2 text-foreground border border-border truncate">
                  {settings.workspaceRoot || "~/ollama-chat-workspaces"}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  onClick={() => navigator.clipboard?.writeText(settings.workspaceRoot)}
                  title="Copy path"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                All workspaces are stored here. Each workspace is a subfolder with its own CLAUDE.md, CONTEXT.md, and supporting files.
                This path is always accessible to the workspace builder AI.
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* Trusted Directories */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <FolderLock className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trusted Directories</h3>
            {saving && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Grant the AI read and write access to directories outside the workspace root.
            Use this to point the assistant at an existing project folder so it can read
            your code and write files directly into your project.
          </p>

          {/* Existing trusted dirs */}
          {settings.trustedDirs.length > 0 ? (
            <ul className="space-y-1.5">
              {settings.trustedDirs.map((dir) => (
                <li key={dir} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
                  <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                  <code className="flex-1 mono text-xs truncate text-foreground">{dir}</code>
                  <button
                    onClick={() => handleRemoveDir(dir)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-5 text-center">
              <FolderLock className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No trusted directories yet.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Add a path below to grant the AI access.</p>
            </div>
          )}

          {/* Add new directory */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={newDir}
                onChange={(e) => { setNewDir(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddDir(); }}
                placeholder="/home/you/projects/my-app"
                className="mono text-xs h-9 flex-1"
              />
              <Button
                onClick={handleAddDir}
                disabled={!newDir.trim() || mockMode}
                size="sm"
                className="h-9 gap-1.5 text-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {mockMode && (
              <p className="text-[10px] text-warn">Connect to the backend to manage settings.</p>
            )}
          </div>
        </section>

        <Separator />

        {/* Command-line / Terminal access */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terminal Access</h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-400/40 bg-amber-400/10 text-amber-500 font-medium">coming soon</span>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Shell command execution inside trusted directories is planned for the next release.
              The AI will be able to run commands (e.g. <code className="mono text-[0.85em] bg-muted px-1 rounded">npm install</code>,{" "}
              <code className="mono text-[0.85em] bg-muted px-1 rounded">git init</code>) scoped strictly to
              the workspace root and any directory listed above.
            </p>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
