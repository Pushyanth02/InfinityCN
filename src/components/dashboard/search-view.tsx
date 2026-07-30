"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Library as LibraryIcon,
  Search as SearchIcon,
  X,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { useNav } from "@/lib/nav-store";
import { useDocuments } from "@/hooks/use-api";
import {
  formatBytes,
  gradientForId,
  SOURCE_LABELS,
  timeAgo,
  type DocumentRow,
  type SourceType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatWordCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const SOURCE_TYPES: SourceType[] = [
  "pdf",
  "epub",
  "docx",
  "md",
  "txt",
  "html",
  "other",
];

function matchQuery(doc: DocumentRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (doc.title.toLowerCase().includes(needle)) return true;
  if (doc.author && doc.author.toLowerCase().includes(needle)) return true;
  if (doc.sourceType.toLowerCase().includes(needle)) return true;
  if (SOURCE_LABELS[doc.sourceType].toLowerCase().includes(needle)) return true;
  if (doc.tags.some((t) => t.toLowerCase().includes(needle))) return true;
  if (doc.collection && doc.collection.toLowerCase().includes(needle))
    return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Section header                                                      */
/* ------------------------------------------------------------------ */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="noir-eyebrow">{eyebrow}</p>
      <h2 className="noir-display text-3xl text-foreground sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="max-w-xl text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source type chips                                                   */
/* ------------------------------------------------------------------ */

function SourceTypeChips({
  active,
  available,
  counts,
  onToggle,
  onClear,
}: {
  active: SourceType[];
  available: SourceType[];
  counts: Record<SourceType, number>;
  onToggle: (s: SourceType) => void;
  onClear: () => void;
}) {
  if (available.length === 0) return null;
  return (
    <div className="noir-card flex flex-wrap items-center gap-1.5 p-2">
      <button
        type="button"
        onClick={onClear}
        aria-pressed={active.length === 0}
        className={cn(
          "focus-ring inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs transition",
          active.length === 0
            ? "noir-btn-gold"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        )}
      >
        All types
      </button>
      <span className="mx-1 h-4 w-px bg-border/60" aria-hidden />
      {available.map((s) => {
        const isActive = active.includes(s);
        const count = counts[s] ?? 0;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            aria-pressed={isActive}
            className={cn(
              "focus-ring inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition",
              isActive
                ? "noir-btn-gold"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {SOURCE_LABELS[s]}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                isActive
                  ? "bg-black/20 text-black/80"
                  : "bg-white/[0.06] text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result row                                                          */
/* ------------------------------------------------------------------ */

function ResultRow({
  doc,
  onOpen,
}: {
  doc: DocumentRow;
  onOpen: (id: string) => void;
}) {
  const gradient = doc.coverGradient || gradientForId(doc.id);
  const lastRead = doc.lastReadAt
    ? `Read ${timeAgo(doc.lastReadAt)}`
    : "Not opened yet";
  const progress = Math.round(doc.readingProgress * 100);

  return (
    <button
      type="button"
      onClick={() => onOpen(doc.id)}
      className="noir-card noir-card-hover focus-ring group flex w-full items-center gap-4 p-3 text-left"
      aria-label={`Open ${doc.title}`}
    >
      <div
        className="hidden size-14 shrink-0 items-center justify-center rounded-md sm:flex"
        style={{ background: gradient }}
        aria-hidden
      >
        <FileText className="size-5 text-white/80" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-1 text-sm font-medium text-foreground group-hover:text-[var(--noir-gold-soft)]">
            {doc.title}
          </h3>
          <span className="noir-chip noir-chip-gold shrink-0">
            {SOURCE_LABELS[doc.sourceType]}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {doc.author ? `${doc.author} · ` : ""}
          {doc.chapterCount} chapter{doc.chapterCount === 1 ? "" : "s"} ·{" "}
          {formatWordCount(doc.wordCount)} words · {formatBytes(doc.byteSize)}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {lastRead}
          {progress > 0 ? ` · ${progress}% complete` : ""}
        </p>
      </div>
      <BookOpen className="size-4 shrink-0 text-muted-foreground transition group-hover:text-[var(--noir-gold)]" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

function StartTypingState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="noir-card p-12 text-center">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
        <SearchIcon className="size-5 text-[var(--noir-gold)]" />
      </div>
      <h3 className="noir-display text-2xl text-foreground">
        Search your library
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Start typing to find documents by title, author, tag, or file type.
        Results appear here instantly.
      </p>
      <Button
        type="button"
        variant="outline"
        className="noir-btn-ghost mt-5"
        onClick={onBrowse}
      >
        <LibraryIcon className="size-4" />
        Browse the library
      </Button>
    </div>
  );
}

function NoResultsState({
  query,
  onReset,
}: {
  query: string;
  onReset: () => void;
}) {
  return (
    <div className="noir-card p-12 text-center">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
        <SearchIcon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="noir-display text-2xl text-foreground">No results</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Nothing matched{" "}
        <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span>
        {". "}
        Try a different keyword or clear your filters.
      </p>
      <Button
        type="button"
        variant="outline"
        className="noir-btn-ghost mt-5"
        onClick={onReset}
      >
        <X className="size-4" />
        Clear search
      </Button>
    </div>
  );
}

function EmptyLibraryState({ onImport }: { onImport: () => void }) {
  return (
    <div className="noir-card p-12 text-center">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
        <LibraryIcon className="size-5 text-[var(--noir-gold)]" />
      </div>
      <h3 className="noir-display text-2xl text-foreground">
        Your library is empty
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Import a document and it will appear here the next time you search.
      </p>
      <Button
        type="button"
        className="noir-btn-gold mt-5"
        onClick={onImport}
      >
        Import a document
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function SearchView() {
  const go = useNav((s) => s.go);
  const { docs, loading } = useDocuments();
  const [query, setQuery] = useState("");
  const [activeTypes, setActiveTypes] = useState<SourceType[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search field on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const availableTypes = useMemo(
    () => SOURCE_TYPES.filter((s) => docs.some((d) => d.sourceType === s)),
    [docs],
  );

  const typeCounts = useMemo(() => {
    const map = {} as Record<SourceType, number>;
    for (const s of SOURCE_TYPES) map[s] = 0;
    for (const d of docs) map[d.sourceType] = (map[d.sourceType] ?? 0) + 1;
    return map;
  }, [docs]);

  const results = useMemo(() => {
    const q = query.trim();
    return docs
      .filter((d) => matchQuery(d, q))
      .filter(
        (d) =>
          activeTypes.length === 0 || activeTypes.includes(d.sourceType),
      )
      .sort((a, b) => {
        // Best matches first: title starts-with, then includes, then recency.
        const needle = q.toLowerCase();
        const at = a.title.toLowerCase();
        const bt = b.title.toLowerCase();
        const aStarts = at.startsWith(needle) ? 0 : 1;
        const bStarts = bt.startsWith(needle) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [docs, query, activeTypes]);

  function toggleType(s: SourceType) {
    setActiveTypes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function clearAll() {
    setQuery("");
    setActiveTypes([]);
  }

  const hasQuery = query.trim().length > 0;
  const libraryIsEmpty = !loading && docs.length === 0;

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Search" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeader
          eyebrow="Find"
          title="Search"
          subtitle="Search across your library."
        />

        {/* Search field */}
        <div className="noir-card mt-6 flex items-center gap-3 p-3">
          <SearchIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, tag, or file type…"
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            aria-label="Search your library"
          />
          {hasQuery || activeTypes.length > 0 ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              onClick={clearAll}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {/* Source-type filter chips */}
        {!libraryIsEmpty ? (
          <div className="mt-3">
            <SourceTypeChips
              active={activeTypes}
              available={availableTypes}
              counts={typeCounts}
              onToggle={toggleType}
              onClear={() => setActiveTypes([])}
            />
          </div>
        ) : null}

        {/* Results */}
        <div className="mt-8 space-y-3">
          {libraryIsEmpty ? (
            <EmptyLibraryState onImport={() => go("upload")} />
          ) : !hasQuery && activeTypes.length === 0 ? (
            <StartTypingState onBrowse={() => go("library")} />
          ) : results.length === 0 ? (
            <NoResultsState query={query.trim() || "these filters"} onReset={clearAll} />
          ) : (
            <>
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>
                  {results.length} result{results.length === 1 ? "" : "s"}
                  {hasQuery ? (
                    <span className="text-muted-foreground/70">
                      {" "}
                      for &ldquo;{query.trim()}&rdquo;
                    </span>
                  ) : null}
                </span>
                {(hasQuery || activeTypes.length > 0) && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              {results.map((doc) => (
                <ResultRow
                  key={doc.id}
                  doc={doc}
                  onOpen={(id) => go("reader", { documentId: id })}
                />
              ))}
            </>
          )}
        </div>

        <footer className="mt-12 text-xs text-muted-foreground">
          © 2025 Lemniscate.
        </footer>
      </main>
    </div>
  );
}
