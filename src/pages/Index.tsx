import { useCallback, useEffect, useState } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { TopBar } from "@/components/chat/TopBar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { ConfigDetailPanel } from "@/components/config/ConfigDetailPanel";
import { NewWorkspacePanel } from "@/components/config/NewWorkspacePanel";
import { UpdatePanel } from "@/components/config/UpdatePanel";
import { BackupPanel } from "@/components/config/BackupPanel";
import {
  fetchWorkspaceFiles,
  fetchWorkspaceList,
  switchWorkspace,
} from "@/lib/api";
import {
  loadSessions,
  saveSession,
  deleteSession as deleteStoredSession,
  newSession,
  sessionTitle,
} from "@/lib/sessions";
import type {
  BackendStatus,
  ChatSession,
  ChatMessage,
  SelectedView,
  WorkspaceInfo,
  ArtifactFile,
} from "@/lib/types";

const Index = () => {
  const [model, setModel] = useState("llama3 (mock)");
  const [status, setStatus] = useState<BackendStatus>({
    reachable: false,
    ollamaInstalled: false,
    models: [],
  });

  // Workspace state
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState("general");

  // Session management — namespaced by workspace
  const [sessions, setSessions] = useState<ChatSession[]>(() =>
    loadSessions(activeWorkspace),
  );
  const [activeSession, setActiveSession] = useState<ChatSession>(() =>
    newSession("llama3 (mock)"),
  );

  // View state
  const [sidebarTab, setSidebarTab] = useState<"chats" | "config">("chats");
  const [selectedView, setSelectedView] = useState<SelectedView>(null);
  const [wsFileVersion, setWsFileVersion] = useState(0);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);

  // Artifact panel state
  const [artifactFiles, setArtifactFiles] = useState<ArtifactFile[]>([]);
  const [showArtifact, setShowArtifact] = useState(false);

  // Load workspaces + sync status on backend connect
  useEffect(() => {
    if (!status.reachable) return;
    fetchWorkspaceList()
      .then(({ workspaces: ws, active }) => {
        setWorkspaces(ws);
        setActiveWorkspace(active);
        setSessions(loadSessions(active));
      })
      .catch(() => {});
  }, [status.reachable]);

  // When active workspace changes, reload sessions
  useEffect(() => {
    setSessions(loadSessions(activeWorkspace));
    setActiveSession(newSession(model));
    setSelectedView(null);
    setShowNewWorkspace(false);
  }, [activeWorkspace]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Session handlers ---
  function handleNewChat() {
    setActiveSession(newSession(model));
    setSidebarTab("chats");
    setSelectedView(null);
    setShowNewWorkspace(false);
  }

  function handleSelectSession(session: ChatSession) {
    setActiveSession(session);
    setSidebarTab("chats");
    setSelectedView(null);
    setShowNewWorkspace(false);
  }

  function handleDeleteSession(id: string) {
    deleteStoredSession(id, activeWorkspace);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  const handleSessionUpdate = useCallback(
    (messages: ChatMessage[]) => {
      if (messages.length === 0) return;
      const updated: ChatSession = {
        ...activeSession,
        title: sessionTitle(messages),
        model,
        messages,
        updatedAt: Date.now(),
        createdAt: activeSession.createdAt || Date.now(),
      };
      setActiveSession(updated);
      saveSession(updated, activeWorkspace);
      setSessions(loadSessions(activeWorkspace));
    },
    [activeSession, model, activeWorkspace],
  );

  // --- Workspace handlers ---
  async function handleSwitchWorkspace(name: string) {
    try {
      await switchWorkspace(name);
      setActiveWorkspace(name);
      setWsFileVersion((v) => v + 1);
      // Refresh workspace list to get updated state
      const { workspaces: ws } = await fetchWorkspaceList();
      setWorkspaces(ws);
    } catch (e) {
      console.error("Switch workspace failed:", e);
    }
  }

  function handleWorkspaceCreated(name: string) {
    setActiveWorkspace(name);
    setShowNewWorkspace(false);
    setWsFileVersion((v) => v + 1);
    fetchWorkspaceList()
      .then(({ workspaces: ws }) => setWorkspaces(ws))
      .catch(() => {});
  }

  // --- View handlers ---
  function handleSelectView(view: SelectedView) {
    setSelectedView(view);
    setShowNewWorkspace(false);
    if (view !== null) setSidebarTab("config");
  }

  async function refreshWsFiles() {
    setWsFileVersion((v) => v + 1);
    if (!status.reachable) return;
    await fetchWorkspaceFiles();
  }

  // --- Artifact handlers ---
  function handleFileBlocks(files: ArtifactFile[]) {
    setArtifactFiles(files);
    setShowArtifact(true);
  }

  const mockMode = !status.reachable;

  const showUpdate = selectedView?.type === "update";
  const showFile = selectedView?.type === "file";
  const showBackup = selectedView?.type === "backup";
  const showNewWs = showNewWorkspace;
  const showChat = !showUpdate && !showFile && !showNewWs && !showBackup;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar
        model={model}
        setModel={setModel}
        onStatus={(s) => {
          setStatus(s);
          if (s.reachable && s.models.length > 0) {
            setModel(s.models[0]);
            setActiveSession((prev) => ({ ...prev, model: s.models[0] }));
          }
        }}
      />

      <div className="flex-1 flex min-h-0">
        <AppSidebar
          sessions={sessions}
          activeSessionId={activeSession.id}
          mockMode={mockMode}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onSelectView={handleSelectView}
          selectedView={selectedView}
          activeTab={sidebarTab}
          onTabChange={(tab) => {
            setSidebarTab(tab);
            if (tab === "chats") setSelectedView(null);
          }}
          wsFileVersion={wsFileVersion}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSwitchWorkspace={handleSwitchWorkspace}
          onNewWorkspace={() => { setShowNewWorkspace(true); setSidebarTab("config"); }}
        />

        <main className="flex-1 min-w-0 flex flex-col bg-gradient-paper overflow-hidden">
          {showUpdate && <UpdatePanel mockMode={mockMode} />}
          {showBackup && (
            <BackupPanel
              workspaces={workspaces}
              onRestored={() => {
                fetchWorkspaceList()
                  .then(({ workspaces: ws }) => setWorkspaces(ws))
                  .catch(() => {});
              }}
            />
          )}
          {showFile && (
            <ConfigDetailPanel
              key={selectedView.file.path}
              file={selectedView.file}
              mockMode={mockMode}
              onRefreshFiles={refreshWsFiles}
            />
          )}
          {showNewWs && (
            <NewWorkspacePanel
              models={status.models}
              onCreated={handleWorkspaceCreated}
              onCancel={() => setShowNewWorkspace(false)}
            />
          )}
          {showChat && (
            <PanelGroup direction="horizontal" className="flex-1 min-h-0">
              <Panel defaultSize={showArtifact ? 60 : 100} minSize={40}>
                <ChatPanel
                  key={`${activeSession.id}-${activeWorkspace}`}
                  model={model}
                  mockMode={mockMode}
                  initialMessages={activeSession.messages}
                  onSessionUpdate={handleSessionUpdate}
                  onFileBlocks={handleFileBlocks}
                  sessionTitle={activeSession.title}
                  onRenameSession={(title) => {
                    const updated = { ...activeSession, title, updatedAt: Date.now() };
                    setActiveSession(updated);
                    saveSession(updated, activeWorkspace);
                    setSessions(loadSessions(activeWorkspace));
                  }}
                />
              </Panel>
              {showArtifact && artifactFiles.length > 0 && (
                <>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />
                  <Panel defaultSize={40} minSize={25}>
                    <ArtifactPanel
                      files={artifactFiles}
                      onClose={() => setShowArtifact(false)}
                      onFilesChange={setArtifactFiles}
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;
