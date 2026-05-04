export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  tokensIn?: number;
  tokensOut?: number;
  prompt?: AssembledPrompt;
  createdAt: number;
}

export interface RetrievedSnippet {
  file: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  score: number;
}

export interface AssembledPrompt {
  composed: string;
  sections: {
    identity: string;
    task: string;
    context: string;
    constraints: string[];
    outputFormat: string;
  };
  snippets: RetrievedSnippet[];
  tokens: {
    identity: number;
    task: number;
    context: number;
    constraints: number;
    outputFormat: number;
    history: number;
    total: number;
  };
}

export type WorkspaceFileKind =
  | "identity"
  | "context"
  | "references"
  | "config"
  | "template"
  | "snippet"
  | "corpus";

export interface WorkspaceFile {
  path: string;
  kind: WorkspaceFileKind;
  lines: number;
  bytes?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface BackendStatus {
  reachable: boolean;
  ollamaInstalled: boolean;
  models: string[];
  port?: number;
  gpuAvailable?: boolean;
}

export interface SubmoduleStatus {
  path: string;
  commit: string;
  status: "clean" | "updated" | "missing" | "conflict" | "unknown";
  tag: string;
}

export interface GitStatus {
  branch: string;
  commit: string;
  commitMsg: string;
  submodules: SubmoduleStatus[];
}

export type SelectedView =
  | { type: "file"; file: WorkspaceFile }
  | { type: "update" }
  | { type: "backup" }
  | null;

export interface WorkspaceInfo {
  name: string;
  path: string;
  description: string;
  model: string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceInfo[];
  active: string;
}

export interface ArtifactFile {
  filename: string;
  content: string;
}
