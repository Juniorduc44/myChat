import { useEffect, useState } from "react";
import {
  Save, Edit3, X, RefreshCw, Plus, Zap, FileText, AlertCircle,
  BookOpen, Sparkles, BookMarked, Library, FileJson, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceFile, WorkspaceFileKind } from "@/lib/types";
import { fetchFileContent, saveFileContent } from "@/lib/api";

const KIND_META: Record<WorkspaceFileKind, { label: string; color: string; icon: typeof FileText; hint: string }> = {
  identity: {
    label: "Identity",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: Sparkles,
    hint: "Defines who the AI is — its persona, vocabulary, and default assumptions. Loaded on every prompt.",
  },
  context: {
    label: "Context",
    color: "bg-accent/10 text-accent border-accent/20",
    icon: BookMarked,
    hint: "Project-specific background. Loaded as Part 3 of the five-part prompt alongside retrieval snippets.",
  },
  references: {
    label: "References",
    color: "bg-provenance/10 text-provenance border-provenance/20",
    icon: Library,
    hint: "Background reading indexed for FTS retrieval. Cited in responses with file:line provenance.",
  },
  config: {
    label: "Config",
    color: "bg-secondary text-secondary-foreground border-border",
    icon: FileJson,
    hint: "Controls model, port, token budget, and retrieval settings. Restart the server after saving.",
  },
  template: {
    label: "Template",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: FileText,
    hint: "Reusable prompt templates. Referenced by name in prompts to inject structured formats.",
  },
  snippet: {
    label: "Skill",
    color: "bg-warn/10 text-warn border-warn/20",
    icon: Zap,
    hint: "Short reusable prompt fragments — instructions, constraints, or output formats you invoke by name.",
  },
  corpus: {
    label: "Corpus",
    color: "bg-muted text-muted-foreground border-border",
    icon: Box,
    hint: "Document chunks indexed by the FTS engine. Run `npm run index` after adding files here.",
  },
};

interface Props {
  file: WorkspaceFile;
  mockMode: boolean;
  onRefreshFiles: () => void;
}

export function ConfigDetailPanel({ file, mockMode, onRefreshFiles }: Props) {
  const [content, setContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const meta = KIND_META[file.kind];
  const Icon = meta.icon;

  useEffect(() => {
    setEditing(false);
    setError(null);
    setSaved(false);
    if (mockMode) {
      setContent("(Connect backend to view and edit workspace files)");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchFileContent(file.path)
      .then((c) => {
        setContent(c);
        setEditContent(c);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [file.path, mockMode]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveFileContent(file.path, editContent);
      setContent(editContent);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onRefreshFiles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-hero flex items-center justify-center shadow-glow shrink-0">
              <Icon className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold mono truncate">{file.path}</h2>
                <span className={`chip border text-[10px] ${meta.color}`}>{meta.label}</span>
                {saved && (
                  <span className="chip border border-primary/30 bg-primary/10 text-primary text-[10px]">
                    Saved ✓
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{meta.hint}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!editing ? (
              <Button
                onClick={() => { setEditContent(content); setEditing(true); }}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={mockMode || loading}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => { setEditing(false); setEditContent(content); }}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={saving}
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-3">
          <StatChip label="Lines" value={String(file.lines)} />
          {file.bytes != null && (
            <StatChip label="Size" value={formatBytes(file.bytes)} />
          )}
          <StatChip label="Kind" value={file.kind} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-6 mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : editing ? (
          <div className="flex-1 flex flex-col px-6 py-4 gap-3">
            {file.kind === "config" && (
              <p className="text-xs text-warn flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Restart the backend server after saving workspace.json.
              </p>
            )}
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="flex-1 font-mono text-xs resize-none bg-background min-h-[300px]"
              spellCheck={false}
            />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <pre className="px-6 py-4 text-xs mono whitespace-pre-wrap break-words leading-relaxed text-foreground">
              {content}
            </pre>
          </ScrollArea>
        )}
      </div>

      {/* Skills footer — only for snippet / template kinds */}
      {(file.kind === "snippet" || file.kind === "template") && !editing && (
        <SkillsFooter fileKind={file.kind} mockMode={mockMode} onRefresh={onRefreshFiles} />
      )}
    </div>
  );
}

function SkillsFooter({
  fileKind,
  mockMode,
  onRefresh,
}: {
  fileKind: WorkspaceFileKind;
  mockMode: boolean;
  onRefresh: () => void;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dir = fileKind === "snippet" ? "snippets" : "templates";
  const ext = fileKind === "snippet" ? ".md" : ".prompt";

  async function addSkill() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const path = `${dir}/${name.trim().replace(/[^a-zA-Z0-9_-]/g, "-")}${ext}`;
      await saveFileContent(path, body.trim());
      setName("");
      setBody("");
      setOpen(false);
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface-sunken/40 px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap className="w-4 h-4 text-warn" />
          Add to Skills Arsenal
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs border-dashed"
          onClick={() => setOpen((o) => !o)}
          disabled={mockMode}
        >
          <Plus className="w-3 h-3" />
          New {fileKind === "snippet" ? "Skill" : "Template"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 mt-3 animate-fade-in">
          <Input
            placeholder={`Name (e.g. concise-responder)`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-xs mono"
          />
          <Textarea
            placeholder={`Content of the ${fileKind}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="text-xs mono min-h-[80px] resize-none"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={addSkill}
              disabled={saving || !name.trim() || !body.trim()}
            >
              {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save {fileKind === "snippet" ? "Skill" : "Template"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setOpen(false); setError(null); }}
            >
              Cancel
            </Button>
          </div>
          <Separator />
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Saved to <code className="mono text-foreground">{dir}/{name || "…"}{ext}</code>.
              Run <code className="mono text-foreground">npm run index</code> to make it searchable.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[10px] mono text-muted-foreground">
      <span className="text-foreground font-medium">{value}</span> {label.toLowerCase()}
    </span>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
