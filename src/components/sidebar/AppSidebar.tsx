import { useEffect, useState } from "react";
import {
  MessageSquare, Settings2, Plus, Trash2, FolderTree,
  Sparkles, BookMarked, Library, FileText, Box, FileJson,
  ChevronRight, Zap, ArrowUpCircle, GitBranch, Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import type { ChatSession, WorkspaceFile, WorkspaceFileKind, SelectedView, WorkspaceInfo } from "@/lib/types";
import { groupSessionsByDate, deleteSession as deleteStoredSession } from "@/lib/sessions";
import { fetchWorkspaceFiles } from "@/lib/api";
import { listWorkspace } from "@/lib/mockOllama";
import { WorkspaceSelector } from "./WorkspaceSelector";

const KIND_ICON: Record<WorkspaceFileKind, typeof FileText> = {
  identity: Sparkles,
  context: BookMarked,
  references: Library,
  config: FileJson,
  template: FileText,
  snippet: Zap,
  corpus: Box,
};

const FILE_GROUPS: { label: string; kinds: WorkspaceFileKind[]; description: string }[] = [
  { label: "Identity & Memory", kinds: ["identity", "context", "references"], description: "Core files that define who your AI is and what it knows" },
  { label: "Configuration", kinds: ["config"], description: "Model, port, token budget, retrieval settings" },
  { label: "Skills Arsenal", kinds: ["snippet", "template"], description: "Reusable prompt snippets and templates loaded into every session" },
  { label: "Knowledge Base", kinds: ["corpus"], description: "Indexed documents for FTS retrieval with provenance" },
];

interface Props {
  sessions: ChatSession[];
  activeSessionId: string;
  mockMode: boolean;
  onNewChat: () => void;
  onSelectSession: (session: ChatSession) => void;
  onDeleteSession: (id: string) => void;
  onSelectView: (view: SelectedView) => void;
  selectedView: SelectedView;
  activeTab: "chats" | "config";
  onTabChange: (tab: "chats" | "config") => void;
  wsFileVersion?: number;
  // workspace props
  workspaces: WorkspaceInfo[];
  activeWorkspace: string;
  onSwitchWorkspace: (name: string) => void;
  onNewWorkspace: () => void;
}

export function AppSidebar({
  sessions,
  activeSessionId,
  mockMode,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onSelectView,
  selectedView,
  activeTab,
  onTabChange,
  wsFileVersion = 0,
  workspaces,
  activeWorkspace,
  onSwitchWorkspace,
  onNewWorkspace,
}: Props) {
  const [wsFiles, setWsFiles] = useState<WorkspaceFile[]>([]);

  useEffect(() => {
    if (!mockMode) {
      fetchWorkspaceFiles().then((files) => setWsFiles(files.length ? files : listWorkspace()));
    } else {
      setWsFiles(listWorkspace());
    }
  }, [mockMode, wsFileVersion]);

  const groups = groupSessionsByDate(sessions.filter((s) => s.id !== activeSessionId));
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const selectedFilePath =
    selectedView?.type === "file" ? selectedView.file.path : null;
  const updateSelected = selectedView?.type === "update";
  const backupSelected = selectedView?.type === "backup";

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col h-full">
      <WorkspaceSelector
        workspaces={workspaces}
        active={activeWorkspace}
        onSwitch={onSwitchWorkspace}
        onNewWorkspace={onNewWorkspace}
        onOpenBackup={() => onSelectView({ type: "backup" })}
      />
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as "chats" | "config")}
        className="flex flex-col h-full"
      >
        <TabsList className="shrink-0 rounded-none border-b border-border bg-transparent h-10 px-2 gap-1">
          <TabsTrigger
            value="chats"
            className="flex-1 gap-1.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none rounded-md"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chats
          </TabsTrigger>
          <TabsTrigger
            value="config"
            className="flex-1 gap-1.5 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none rounded-md"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Config
          </TabsTrigger>
        </TabsList>

        {/* ── CHATS TAB ── */}
        <TabsContent value="chats" className="flex-1 flex flex-col mt-0 min-h-0">
          <div className="shrink-0 px-3 pt-3 pb-2">
            <Button
              onClick={onNewChat}
              variant="outline"
              size="sm"
              className="w-full gap-2 h-8 text-xs border-dashed"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </Button>
          </div>

          <ScrollArea className="flex-1 px-2">
            <div className="pb-3 space-y-4">
              {activeSession && (
                <div>
                  <SectionLabel label="Current" />
                  <SessionRow session={activeSession} isActive onSelect={() => {}} onDelete={() => {}} />
                </div>
              )}

              {Object.entries(groups).map(([label, group]) =>
                group.length === 0 ? null : (
                  <div key={label}>
                    <SectionLabel label={label} />
                    <ul className="space-y-0.5">
                      {group.map((s) => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          isActive={false}
                          onSelect={() => onSelectSession(s)}
                          onDelete={() => {
                            deleteStoredSession(s.id, activeWorkspace);
                            onDeleteSession(s.id);
                          }}
                        />
                      ))}
                    </ul>
                  </div>
                ),
              )}

              {sessions.length === 0 && (
                <p className="text-[11px] text-muted-foreground px-2 py-4 text-center leading-relaxed">
                  No history yet.<br />Start a conversation to save it here.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── CONFIG TAB ── */}
        <TabsContent value="config" className="flex-1 flex flex-col mt-0 min-h-0">
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <FolderTree className="w-3.5 h-3.5 text-primary" />
              <span>Workspace</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 mono">
              {wsFiles.length} files · {mockMode ? "mock" : "live"}
            </p>
          </div>

          <ScrollArea className="flex-1 px-2 py-2">
            <div className="space-y-4 pb-2">
              {FILE_GROUPS.map((group) => {
                const items = wsFiles.filter((f) => group.kinds.includes(f.kind));
                if (items.length === 0) return null;
                return (
                  <div key={group.label}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold cursor-default">
                          {group.label}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs max-w-[200px]">
                        {group.description}
                      </TooltipContent>
                    </Tooltip>
                    <ul className="space-y-0.5">
                      {items.map((f) => {
                        const Icon = KIND_ICON[f.kind];
                        const isSelected = selectedFilePath === f.path;
                        return (
                          <li key={f.path}>
                            <button
                              onClick={() => onSelectView({ type: "file", file: f })}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left group transition-colors ${
                                isSelected
                                  ? "bg-primary/10 text-primary border border-primary/20"
                                  : "hover:bg-muted text-foreground"
                              }`}
                            >
                              <Icon
                                className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                                  isSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                                }`}
                              />
                              <span className="truncate flex-1 mono text-xs">{f.path}</span>
                              <span className="text-[10px] mono text-muted-foreground shrink-0">{f.lines}L</span>
                              {isSelected && <ChevronRight className="w-3 h-3 shrink-0 text-primary" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* System section — always visible at bottom of Config tab */}
          <div className="shrink-0 border-t border-border">
            <div className="px-2 py-2">
              <SectionLabel label="System" />
              <button
                onClick={() => onSelectView({ type: "update" })}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left group transition-colors ${
                  updateSelected
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <ArrowUpCircle
                  className={`w-3.5 h-3.5 shrink-0 ${
                    updateSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                  }`}
                />
                <span className="flex-1 text-xs">Update System</span>
                <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
                {updateSelected && <ChevronRight className="w-3 h-3 shrink-0 text-primary" />}
              </button>
              <button
                onClick={() => onSelectView({ type: "backup" })}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left group transition-colors ${
                  backupSelected
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <Archive
                  className={`w-3.5 h-3.5 shrink-0 ${
                    backupSelected ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                  }`}
                />
                <span className="flex-1 text-xs">Backup &amp; Restore</span>
                {backupSelected && <ChevronRight className="w-3 h-3 shrink-0 text-primary" />}
              </button>
            </div>
            <Separator />
            <div className="px-4 py-3 bg-surface-sunken/50">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Edit files to change identity, context, and skills.{" "}
                <code className="mono text-foreground">npm run index</code> to re-index corpora.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-2 mb-1 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      {label}
    </div>
  );
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const time = new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <li onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onSelect}
        className={`w-full flex items-start gap-2 px-2 py-2 rounded-md text-left group transition-colors ${
          isActive
            ? "bg-primary/10 border border-primary/20 text-primary"
            : "hover:bg-muted text-foreground"
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate leading-snug ${isActive ? "text-primary" : ""}`}>
            {session.title}
          </p>
          <p className="text-[10px] mono text-muted-foreground mt-0.5 truncate">
            {session.model} · {time}
          </p>
        </div>
        {isActive && <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />}
        {!isActive && hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete chat"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </button>
    </li>
  );
}
