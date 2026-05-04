import { useState, useCallback } from "react";
import { TopBar } from "@/components/chat/TopBar";
import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ConfigDetailPanel } from "@/components/config/ConfigDetailPanel";
import { UpdatePanel } from "@/components/config/UpdatePanel";
import { fetchWorkspaceFiles } from "@/lib/api";
import { loadSessions, saveSession, newSession, sessionTitle } from "@/lib/sessions";
import type { BackendStatus, ChatSession, ChatMessage, SelectedView } from "@/lib/types";

const Index = () => {
  const [model, setModel] = useState("llama3 (mock)");
  const [status, setStatus] = useState<BackendStatus>({
    reachable: false,
    ollamaInstalled: false,
    models: [],
  });

  // Session management
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeSession, setActiveSession] = useState<ChatSession>(() => newSession("llama3 (mock)"));

  // View state — what shows in the main panel
  const [sidebarTab, setSidebarTab] = useState<"chats" | "config">("chats");
  const [selectedView, setSelectedView] = useState<SelectedView>(null);
  const [wsFileVersion, setWsFileVersion] = useState(0);

  // --- Session handlers ---

  function handleNewChat() {
    setActiveSession(newSession(model));
    setSidebarTab("chats");
    setSelectedView(null);
  }

  function handleSelectSession(session: ChatSession) {
    setActiveSession(session);
    setSidebarTab("chats");
    setSelectedView(null);
  }

  function handleDeleteSession(id: string) {
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
      saveSession(updated);
      setSessions(loadSessions());
    },
    [activeSession, model],
  );

  // --- View handlers ---

  function handleSelectView(view: SelectedView) {
    setSelectedView(view);
    if (view !== null) setSidebarTab("config");
  }

  async function refreshWsFiles() {
    setWsFileVersion((v) => v + 1);
    if (!status.reachable) return;
    await fetchWorkspaceFiles();
  }

  const mockMode = !status.reachable;

  // Determine main panel content
  const showUpdate = selectedView?.type === "update";
  const showFile = selectedView?.type === "file";
  const showChat = !showUpdate && !showFile;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar
        model={model}
        setModel={setModel}
        onStatus={(s) => {
          setStatus(s);
          if (s.reachable && s.models.length > 0) {
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
        />

        <main className="flex-1 min-w-0 flex flex-col bg-gradient-paper">
          {showUpdate && (
            <UpdatePanel mockMode={mockMode} />
          )}
          {showFile && (
            <ConfigDetailPanel
              key={selectedView.file.path}
              file={selectedView.file}
              mockMode={mockMode}
              onRefreshFiles={refreshWsFiles}
            />
          )}
          {showChat && (
            <ChatPanel
              key={activeSession.id}
              model={model}
              mockMode={mockMode}
              initialMessages={activeSession.messages}
              onSessionUpdate={handleSessionUpdate}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default Index;
