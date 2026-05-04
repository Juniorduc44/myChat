import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AssembledPrompt } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  prompt: AssembledPrompt | null;
}

export function PromptInspector({ open, onClose, prompt }: Props) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
          <SheetTitle className="flex items-center justify-between">
            <span>Prompt inspector</span>
            {prompt && (
              <span className="text-xs mono text-muted-foreground font-normal">
                {prompt.tokens.total} tokens · 5 parts
              </span>
            )}
          </SheetTitle>
        </SheetHeader>
        {!prompt ? (
          <div className="p-6 text-sm text-muted-foreground">No prompt assembled yet.</div>
        ) : (
          <div className="p-6 space-y-5">
            <Section label="1. Identity" tokens={prompt.tokens.identity}>
              <p className="text-sm">{prompt.sections.identity}</p>
            </Section>
            <Section label="2. Task" tokens={prompt.tokens.task}>
              <p className="text-sm whitespace-pre-wrap">{prompt.sections.task || <em>(empty)</em>}</p>
            </Section>
            <Section label="3. Context" tokens={prompt.tokens.context}>
              <p className="text-sm whitespace-pre-wrap mb-3">{prompt.sections.context}</p>
              {prompt.snippets.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Retrieved snippets
                  </div>
                  {prompt.snippets.map((s, i) => (
                    <div key={i} className="rounded-md border border-border bg-surface-sunken p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <code className="text-xs mono text-provenance">
                          {s.file}:L{s.lineStart}-{s.lineEnd}
                        </code>
                        <span className="text-xs mono text-muted-foreground">
                          score {s.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section label="4. Constraints" tokens={prompt.tokens.constraints}>
              <ul className="space-y-1 text-sm">
                {prompt.sections.constraints.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-warn">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section label="5. Output Format" tokens={prompt.tokens.outputFormat}>
              <p className="text-sm">{prompt.sections.outputFormat}</p>
            </Section>
            <details className="rounded-lg border border-border">
              <summary className="px-4 py-2 cursor-pointer text-xs mono text-muted-foreground hover:text-foreground">
                view raw composed prompt
              </summary>
              <pre className="terminal-panel m-3 p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                {prompt.composed}
              </pre>
            </details>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  label,
  tokens,
  children,
}: {
  label: string;
  tokens: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold tracking-tight">{label}</h3>
        <span className="text-xs mono text-muted-foreground">{tokens} tok</span>
      </header>
      {children}
    </section>
  );
}
