import { FileText, Settings, BookMarked, Library, Sparkles, FolderTree, Box } from "lucide-react";
import { listWorkspace } from "@/lib/mockOllama";
import type { WorkspaceFileKind } from "@/lib/types";

const ICONS: Record<WorkspaceFileKind, typeof FileText> = {
  identity: Sparkles,
  context: BookMarked,
  references: Library,
  config: Settings,
  template: FileText,
  snippet: FileText,
  corpus: Box,
};

const GROUPS: { label: string; kinds: WorkspaceFileKind[] }[] = [
  { label: "Memory", kinds: ["identity", "context", "references"] },
  { label: "Config", kinds: ["config"] },
  { label: "Templates", kinds: ["template"] },
  { label: "Snippets", kinds: ["snippet"] },
  { label: "Corpora (indexed)", kinds: ["corpus"] },
];

export function WorkspaceSidebar() {
  const files = listWorkspace();
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderTree className="w-4 h-4 text-primary" />
          <span>~/ollama-chat-workspace</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 mono">
          {files.length} files · auto-loaded
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {GROUPS.map((g) => {
          const items = files.filter((f) => g.kinds.includes(f.kind));
          if (items.length === 0) return null;
          return (
            <div key={g.label}>
              <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {items.map((f) => {
                  const Icon = ICONS[f.kind];
                  return (
                    <li key={f.path}>
                      <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted text-left group">
                        <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span className="truncate flex-1 mono text-xs">{f.path}</span>
                        <span className="text-[10px] mono text-muted-foreground">{f.lines}L</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-border bg-surface-sunken/50">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
          Folder is memory
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Edit these files to change identity, context, and grounding. Re-index corpora with{" "}
          <code className="mono text-foreground">npm run index</code>.
        </p>
      </div>
    </aside>
  );
}
