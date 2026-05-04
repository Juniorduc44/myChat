import { useState } from "react";
import { Check, ChevronDown, FolderPlus, Layers } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { WorkspaceInfo } from "@/lib/types";

interface Props {
  workspaces: WorkspaceInfo[];
  active: string;
  onSwitch: (name: string) => void;
  onNewWorkspace: () => void;
}

export function WorkspaceSelector({ workspaces, active, onSwitch, onNewWorkspace }: Props) {
  const [open, setOpen] = useState(false);
  const activeInfo = workspaces.find((w) => w.name === active);

  return (
    <div className="px-2 py-2 border-b border-border">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between h-8 px-2 text-xs font-medium hover:bg-muted"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span className="truncate">{active}</span>
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.name}
              className="flex items-start gap-2 cursor-pointer"
              onSelect={() => { onSwitch(w.name); setOpen(false); }}
            >
              <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${w.name === active ? "opacity-100" : "opacity-0"}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{w.name}</p>
                {w.description && (
                  <p className="text-[10px] text-muted-foreground truncate">{w.description}</p>
                )}
              </div>
            </DropdownMenuItem>
          ))}
          {workspaces.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer text-primary"
            onSelect={() => { onNewWorkspace(); setOpen(false); }}
          >
            <FolderPlus className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Create New Workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {activeInfo?.description && (
        <p className="text-[10px] text-muted-foreground px-2 mt-0.5 truncate">{activeInfo.description}</p>
      )}
    </div>
  );
}
