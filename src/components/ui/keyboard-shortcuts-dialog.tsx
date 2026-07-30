"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Shortcut {
  keys: string;
  description: string;
  scope: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: "⌘ K", description: "Open command palette", scope: "Global" },
  { keys: "?", description: "Open this shortcuts dialog", scope: "Global" },
  { keys: "Esc", description: "Close dialog or panel", scope: "Global" },
  { keys: "→ / Space", description: "Next chunk in reader", scope: "Reader" },
  { keys: "←", description: "Previous chunk in reader", scope: "Reader" },
  { keys: "F", description: "Toggle focus mode", scope: "Reader" },
];

/**
 * KeyboardShortcutsDialog — opens with the `?` key (when not typing in an
 * input). Shows all available keyboard shortcuts grouped by scope.
 */
export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scopes = [...new Set(SHORTCUTS.map((s) => s.scope))];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <kbd className="rounded border px-1.5 py-0.5 text-xs">?</kbd> anywhere to open this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-5">
          {scopes.map((scope) => (
            <div key={scope}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {scope}
              </p>
              <ul className="space-y-2">
                {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
                  <li
                    key={s.keys}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm">{s.description}</span>
                    <kbd className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
