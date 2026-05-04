import { useState } from "react";
import { User, Bot, FileSearch, MoreHorizontal, Copy, Trash2, Download, PenLine, CopyPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageT } from "@/lib/types";

interface Props {
  message: ChatMessageT;
  onInspect?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onSaveAs?: () => void;
  onRename?: () => void;
}

export function ChatMessage({ message, onInspect, onDelete, onDuplicate, onSaveAs, onRename }: Props) {
  const isUser = message.role === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const hasActions = onDelete || onDuplicate || onSaveAs || onRename;

  return (
    <div
      className={cn(
        "flex gap-4 max-w-4xl mx-auto animate-fade-in group",
        isUser && "flex-row-reverse",
      )}
    >
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
            "rounded-xl px-4 py-3 max-w-full relative",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "glass-panel rounded-tl-sm",
          )}
        >
          <Markdown text={message.content} />
          {!isUser && message.content === "" && (
            <span className="caret inline-block w-2 h-4 bg-primary align-middle" />
          )}

          {/* Three-dot menu — visible on hover or when menu is open */}
          {hasActions && (
            <div
              className={cn(
                "absolute top-2 transition-opacity",
                isUser ? "left-2" : "right-2",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      isUser
                        ? "text-primary-foreground/60 hover:text-primary-foreground hover:bg-white/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                    title="Message options"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align={isUser ? "start" : "end"}
                  className="w-44"
                >
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer text-xs"
                    onSelect={copyToClipboard}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copied ? "Copied!" : "Copy"}
                  </DropdownMenuItem>

                  {onDuplicate && (
                    <DropdownMenuItem
                      className="flex items-center gap-2 cursor-pointer text-xs"
                      onSelect={onDuplicate}
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      Duplicate
                    </DropdownMenuItem>
                  )}

                  {onSaveAs && (
                    <DropdownMenuItem
                      className="flex items-center gap-2 cursor-pointer text-xs"
                      onSelect={onSaveAs}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save as…
                    </DropdownMenuItem>
                  )}

                  {onRename && (
                    <DropdownMenuItem
                      className="flex items-center gap-2 cursor-pointer text-xs"
                      onSelect={onRename}
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      Rename chat
                    </DropdownMenuItem>
                  )}

                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="flex items-center gap-2 cursor-pointer text-xs text-destructive focus:text-destructive"
                        onSelect={onDelete}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
