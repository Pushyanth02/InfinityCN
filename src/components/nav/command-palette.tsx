"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDocuments } from "@/hooks/use-api";
import { useNav } from "@/lib/nav-store";
import { BookOpen, FileText, LayoutDashboard, Settings, Upload, BookMarked } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { go } = useNav();
  const { docs } = useDocuments();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lem:command-open", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("lem:command-open", onCustom);
    };
  }, []);

  const nav = (view: any, opts?: any) => {
    setOpen(false);
    setTimeout(() => go(view, opts), 30);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search documents, jump to…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => nav("dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
          </CommandItem>
          <CommandItem onSelect={() => nav("library")}>
            <BookOpen className="mr-2 h-4 w-4" /> Library
          </CommandItem>
          <CommandItem onSelect={() => nav("upload")}>
            <Upload className="mr-2 h-4 w-4" /> Import a document
          </CommandItem>
          <CommandItem onSelect={() => nav("settings")}>
            <Settings className="mr-2 h-4 w-4" /> Settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {docs.length > 0 && (
          <CommandGroup heading="Open document">
            {docs.slice(0, 10).map((d) => (
              <CommandItem
                key={d.id}
                value={`${d.title} ${d.author ?? ""}`}
                onSelect={() => nav("reader", { documentId: d.id })}
              >
                <FileText className="mr-2 h-4 w-4" />
                <span className="truncate">{d.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {d.chapterCount} ch
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {docs.length > 10 && (
          <CommandGroup heading="More">
            <CommandItem onSelect={() => nav("library")}>
              <BookMarked className="mr-2 h-4 w-4" /> See all {docs.length} documents
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
