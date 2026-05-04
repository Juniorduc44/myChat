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
}

export interface BackendStatus {
  reachable: boolean;
  ollamaInstalled: boolean;
  models: string[];
  port?: number;
}
