import { useState } from "react";
import { TopBar } from "@/components/chat/TopBar";
import { WorkspaceSidebar } from "@/components/chat/WorkspaceSidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { BackendStatus } from "@/lib/types";

const Index = () => {
  const [model, setModel] = useState("llama3 (mock)");
  const [status, setStatus] = useState<BackendStatus>({
    reachable: false,
    ollamaInstalled: false,
    models: [],
  });

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar model={model} setModel={setModel} onStatus={setStatus} />
      <div className="flex-1 flex min-h-0">
        <WorkspaceSidebar />
        <main className="flex-1 min-w-0 flex flex-col bg-gradient-paper">
          <ChatPanel model={model} mockMode={!status.reachable} />
        </main>
      </div>
    </div>
  );
};

export default Index;
