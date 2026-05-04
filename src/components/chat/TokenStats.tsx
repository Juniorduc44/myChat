import { ChevronRight } from "lucide-react";
import type { AssembledPrompt } from "@/lib/types";

interface Props {
  prompt: AssembledPrompt;
  onOpen: () => void;
}

export function TokenStats({ prompt, onOpen }: Props) {
  const t = prompt.tokens;
  const segments = [
    { label: "identity", value: t.identity, color: "bg-primary" },
    { label: "task", value: t.task, color: "bg-accent" },
    { label: "context", value: t.context, color: "bg-provenance" },
    { label: "constraints", value: t.constraints, color: "bg-warn" },
    { label: "format", value: t.outputFormat, color: "bg-muted-foreground" },
    { label: "history", value: t.history, color: "bg-secondary-foreground/40" },
  ];
  const total = Math.max(1, segments.reduce((n, s) => n + s.value, 0));

  return (
    <button
      onClick={onOpen}
      className="w-full px-6 py-2.5 border-t border-border bg-card/40 hover:bg-card/70 transition-colors group"
    >
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        <span className="text-xs mono text-muted-foreground shrink-0">prompt</span>
        <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-muted">
          {segments.map((s) => (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value} tok`}
            />
          ))}
        </div>
        <span className="text-xs mono shrink-0">
          <span className="text-foreground font-semibold">{t.total}</span>
          <span className="text-muted-foreground"> tok · {prompt.snippets.length} snippets</span>
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </button>
  );
}
