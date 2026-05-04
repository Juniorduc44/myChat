import { useState } from "react";
import { FolderPlus, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createWorkspace, switchWorkspace } from "@/lib/api";

interface Props {
  models: string[];
  onCreated: (name: string) => void;
  onCancel: () => void;
}

export function NewWorkspacePanel({ models, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState(models[0] ?? "llama3.1:8b");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const safeName = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");

  async function handleCreate() {
    if (!safeName) { setError("Name is required"); return; }
    setBusy(true);
    setError("");
    try {
      await createWorkspace(safeName, { description: description.trim(), model });
      await switchWorkspace(safeName);
      onCreated(safeName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FolderPlus className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">New Workspace</h2>
          <p className="text-xs text-muted-foreground">A folder with its own identity, context, and skills</p>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name" className="text-xs">Name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. coding-assistant"
            className="font-mono text-sm"
          />
          {safeName && safeName !== name.trim() && (
            <p className="text-[10px] text-muted-foreground mono">Will save as: {safeName}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ws-desc" className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea
            id="ws-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this workspace for?"
            className="text-sm resize-none h-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ws-model" className="text-xs">Default Model</Label>
          <select
            id="ws-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {models.length > 0
              ? models.map((m) => <option key={m} value={m}>{m}</option>)
              : <option value="llama3.1:8b">llama3.1:8b</option>
            }
          </select>
        </div>

        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-primary">AI-assisted setup</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                After creating the workspace, switch to it and ask the assistant to fill in the details.
                It will generate CLAUDE.md, CONTEXT.md, and templates using the five-part 1.3 framework.
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 mt-6 pt-4 border-t border-border">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" onClick={handleCreate} disabled={busy || !safeName} className="flex-1 gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
          Create Workspace
        </Button>
      </div>
    </div>
  );
}
