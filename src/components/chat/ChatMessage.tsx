import { User, Bot, FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageT } from "@/lib/types";

interface Props {
  message: ChatMessageT;
  onInspect?: () => void;
}

export function ChatMessage({ message, onInspect }: Props) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-4 max-w-4xl mx-auto animate-fade-in", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border",
          isUser ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border",
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-primary" />}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-xl px-4 py-3 max-w-full",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "glass-panel rounded-tl-sm",
          )}
        >
          <Markdown text={message.content} />
          {!isUser && message.content === "" && (
            <span className="caret inline-block w-2 h-4 bg-primary align-middle" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 px-1 text-xs text-muted-foreground mono">
          {isUser && message.tokensIn != null && <span>{message.tokensIn} tok in</span>}
          {!isUser && message.tokensOut != null && message.tokensOut > 0 && (
            <span>{message.tokensOut} tok out</span>
          )}
          {message.prompt && (
            <button
              onClick={onInspect}
              className="inline-flex items-center gap-1 hover:text-primary transition-colors"
            >
              <FileSearch className="w-3 h-3" /> inspect prompt
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tiny renderer: bold, code, inline code, blockquotes, paragraphs.
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((b, i) => {
        if (b.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-provenance/60 pl-3 text-xs text-muted-foreground mono whitespace-pre-wrap"
            >
              {b.replace(/^> /gm, "")}
            </blockquote>
          );
        }
        if (b.startsWith("```")) {
          const code = b.replace(/```\w*\n?/, "").replace(/```$/, "");
          return (
            <pre key={i} className="terminal-panel p-3 text-xs overflow-x-auto">
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: inline(b) }} />
        );
      })}
    </div>
  );
}

function inline(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="mono px-1 py-0.5 rounded bg-muted text-foreground text-[0.85em]">$1</code>');
}
