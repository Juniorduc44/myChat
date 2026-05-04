import { useState } from "react";
import { X, Save, Check, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveFileContent } from "@/lib/api";
import type { ArtifactFile } from "@/lib/types";

interface Props {
  files: ArtifactFile[];
  onClose: () => void;
  onFilesChange: (files: ArtifactFile[]) => void;
}

export function ArtifactPanel({ files, onClose, onFilesChange }: Props) {
  const [activeFile, setActiveFile] = useState(files[0]?.filename ?? "");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (files.length === 0) return null;

  function updateContent(filename: string, content: string) {
    onFilesChange(files.map((f) => f.filename === filename ? { ...f, content } : f));
    setSaved((s) => ({ ...s, [filename]: false }));
  }

  async function saveFile(filename: string) {
    const file = files.find((f) => f.filename === filename);
    if (!file) return;
    setSaving((s) => ({ ...s, [filename]: true }));
    setErrors((e) => ({ ...e, [filename]: "" }));
    try {
      await saveFileContent(filename, file.content);
      setSaved((s) => ({ ...s, [filename]: true }));
    } catch (e) {
      setErrors((err) => ({ ...err, [filename]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving((s) => ({ ...s, [filename]: false }));
    }
  }

  async function saveAll() {
    await Promise.all(files.map((f) => saveFile(f.filename)));
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-card/60 backdrop-blur-sm min-w-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Generated Files</span>
          <span className="text-[10px] chip border-primary/20 bg-primary/10 text-primary">{files.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs gap-1"
            onClick={saveAll}
          >
            <Save className="w-3 h-3" />
            Save All
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* File tabs */}
      <Tabs value={activeFile} onValueChange={setActiveFile} className="flex flex-col flex-1 min-h-0">
        <TabsList className="shrink-0 rounded-none border-b border-border bg-transparent h-9 px-2 gap-0.5 justify-start overflow-x-auto">
          {files.map((f) => (
            <TabsTrigger
              key={f.filename}
              value={f.filename}
              className="text-[10px] mono px-2.5 h-7 data-[state=active]:bg-muted data-[state=active]:shadow-none rounded-md shrink-0 gap-1"
            >
              {f.filename.split("/").pop()}
              {saved[f.filename] && <Check className="w-2.5 h-2.5 text-green-500" />}
            </TabsTrigger>
          ))}
        </TabsList>

        {files.map((f) => (
          <TabsContent key={f.filename} value={f.filename} className="flex-1 flex flex-col mt-0 min-h-0 p-0">
            <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b border-border">
              <span className="text-[10px] mono text-muted-foreground">{f.filename}</span>
              <div className="flex items-center gap-1.5">
                {errors[f.filename] && (
                  <span className="text-[10px] text-destructive">{errors[f.filename]}</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => saveFile(f.filename)}
                  disabled={saving[f.filename]}
                >
                  {saving[f.filename] ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : saved[f.filename] ? (
                    <Check className="w-2.5 h-2.5 text-green-500" />
                  ) : (
                    <Save className="w-2.5 h-2.5" />
                  )}
                  {saved[f.filename] ? "Saved" : "Save"}
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <textarea
                value={f.content}
                onChange={(e) => updateContent(f.filename, e.target.value)}
                className="w-full h-full min-h-[300px] p-4 font-mono text-xs bg-transparent resize-none focus:outline-none leading-relaxed"
                spellCheck={false}
              />
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// Parses ```file:FILENAME ... ``` blocks from AI response text
export function parseFileBlocks(text: string): ArtifactFile[] {
  const files: ArtifactFile[] = [];
  // Match ~~~file:FILENAME or ```file:FILENAME blocks
  const re = /(?:~~~|```)\s*file:([^\s\n]+)\s*\n([\s\S]*?)(?:~~~|```)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    files.push({ filename: m[1].trim(), content: m[2] });
  }
  return files;
}
