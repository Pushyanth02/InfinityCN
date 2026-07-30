"use client";

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useNav } from "@/lib/nav-store";
import { AppHeader } from "@/components/nav/app-header";
import {
  useDocuments,
  patchDocument,
  deleteDocument,
  uploadFile,
} from "@/hooks/use-api";
import {
  useLibraryPrefs,
  setLibraryPrefs,
  type SortKey,
  type StatusFilter,
} from "@/hooks/use-reader-settings";
import {
  formatBytes,
  timeAgo,
  isRecent,
  SOURCE_LABELS,
  gradientForId,
  type DocumentRow,
  type SourceType,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Grid3x3,
  Heart,
  LayoutList,
  Loader2,
  MoreHorizontal,
  PenLine,
  Search,
  Trash2,
  Upload as UploadIcon,
  X,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Most recent",
  title: "Title (A–Z)",
  size: "File size",
  progress: "Reading progress",
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Error" },
];

function coverGradient(doc: DocumentRow): string {
  return doc.coverGradient ?? gradientForId(doc.id);
}

function sourceLabel(t: SourceType): string {
  return SOURCE_LABELS[t] ?? t.toUpperCase();
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function LibraryView() {
  const { go } = useNav();
  const { docs, loading, error, refresh, setDocs } = useDocuments();
  const prefs = useLibraryPrefs();

  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Derived: all source types present in the library (for filter chips)
  const availableSourceTypes = useMemo<SourceType[]>(() => {
    const set = new Set<SourceType>();
    docs.forEach((d) => set.add(d.sourceType));
    return Array.from(set).sort();
  }, [docs]);

  const hasActiveFilters =
    prefs.status !== "all" ||
    prefs.showFavoritesOnly ||
    prefs.showRecentOnly ||
    prefs.sourceTypes.length > 0 ||
    query.trim().length > 0;

  // Filter + sort pipeline
  const filtered = useMemo<DocumentRow[]>(() => {
    let list = docs.slice();
    if (prefs.status !== "all") {
      list = list.filter((d) => d.status === prefs.status);
    }
    if (prefs.showFavoritesOnly) {
      list = list.filter((d) => d.favorite);
    }
    if (prefs.showRecentOnly) {
      list = list.filter((d) => isRecent(d.createdAt));
    }
    if (prefs.sourceTypes.length > 0) {
      const s = new Set<SourceType>(prefs.sourceTypes as SourceType[]);
      list = list.filter((d) => s.has(d.sourceType));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.author ?? "").toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    switch (prefs.sort) {
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "size":
        list.sort((a, b) => b.byteSize - a.byteSize);
        break;
      case "progress":
        list.sort((a, b) => b.readingProgress - a.readingProgress);
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
    return list;
  }, [docs, prefs.status, prefs.showFavoritesOnly, prefs.showRecentOnly, prefs.sourceTypes, prefs.sort, query]);

  // ── Drag-and-drop file import ──────────────────────────────────────────
  async function handleFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    for (const file of arr) {
      toast(`Importing ${file.name}…`);
      try {
        const { document, error: err } = await uploadFile(file);
        if (err || !document) {
          toast.error(err ?? `Failed to import ${file.name}`);
        } else {
          toast.success(`Imported "${document.title}"`);
        }
      } catch {
        toast.error(`Failed to import ${file.name}`);
      }
    }
    await refresh();
  }

  function onDragOver(e: DragEvent<HTMLDivElement>): void {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dragging) setDragging(true);
    }
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>): void {
    // Only clear when leaving the outer container (not bubbling children)
    if (e.currentTarget === e.target) {
      setDragging(false);
    }
  }
  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  // ── Favorite toggle (optimistic) ───────────────────────────────────────
  async function toggleFavorite(doc: DocumentRow): Promise<void> {
    const next = !doc.favorite;
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, favorite: next } : d)),
    );
    try {
      await patchDocument(doc.id, { favorite: next });
      toast(next ? "Added to favorites" : "Removed from favorites");
    } catch {
      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, favorite: doc.favorite } : d)),
      );
      toast.error("Failed to update favorite");
    }
  }

  // ── Delete flow ────────────────────────────────────────────────────────
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDocs((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      toast.success("Document deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(false);
    }
  }

  function clearFilters(): void {
    setLibraryPrefs({
      status: "all",
      sourceTypes: [],
      showFavoritesOnly: false,
      showRecentOnly: false,
    });
    setQuery("");
  }

  return (
    <div
      className="dashboard-noir min-h-dvh"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Library" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8"
      >
        {/* Header */}
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 space-y-2">
            <p className="noir-eyebrow">Your collection</p>
            <h1 className="noir-display text-4xl">Library</h1>
            <p className="text-sm text-muted-foreground">
              Organize, filter, and read documents stored on this device.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              onClick={() => go("create")}
              variant="outline"
              className="rounded-full px-4 text-sm font-semibold"
            >
              <PenLine className="size-4" />
              Create a story
            </Button>
            <Button
              type="button"
              onClick={() => go("upload")}
              className="noir-btn-gold shrink-0 rounded-full px-4 text-sm font-semibold"
            >
              <UploadIcon className="size-4" />
              Import
            </Button>
          </div>
        </header>

        {/* Toolbar */}
        <Toolbar
          query={query}
          onQuery={setQuery}
          availableSourceTypes={availableSourceTypes}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />

        {/* Result count line */}
        {!loading && docs.length > 0 ? (
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>
              Showing <span className="tabular-nums">{filtered.length}</span> of{" "}
              <span className="tabular-nums">{docs.length}</span>{" "}
              {docs.length === 1 ? "document" : "documents"}
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition hover:text-foreground"
              >
                <X className="size-3" />
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Grid / List / Empty states */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void refresh()} />
        ) : docs.length === 0 ? (
          <EmptyLibraryState onImport={() => go("upload")} />
        ) : filtered.length === 0 ? (
          <NoMatchesState onClear={clearFilters} />
        ) : prefs.view === "grid" ? (
          <DocumentGrid
            docs={filtered}
            onOpen={(id) => go("reader", { documentId: id })}
            onToggleFavorite={toggleFavorite}
            onDeleteRequest={setDeleteTarget}
          />
        ) : (
          <DocumentList
            docs={filtered}
            onOpen={(id) => go("reader", { documentId: id })}
            onToggleFavorite={toggleFavorite}
            onDeleteRequest={setDeleteTarget}
          />
        )}
      </main>

      {/* Drag-and-drop overlay */}
      {dragging ? (
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          aria-hidden
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="noir-card relative flex flex-col items-center gap-3 px-12 py-10">
            <div className="grid size-14 place-items-center rounded-full bg-[color-mix(in_oklab,var(--noir-gold)_18%,transparent)]">
              <UploadIcon className="size-7 text-[var(--noir-gold)]" />
            </div>
            <p className="noir-display text-2xl">Drop to import</p>
            <p className="text-xs text-muted-foreground">
              Release to add files to your library
            </p>
          </div>
        </div>
      ) : null}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.title}" will be permanently removed from your library. This action cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────

function Toolbar({
  query,
  onQuery,
  availableSourceTypes,
  hasActiveFilters,
  onClearFilters,
}: {
  query: string;
  onQuery: (v: string) => void;
  availableSourceTypes: SourceType[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}): ReactNode {
  const prefs = useLibraryPrefs();

  return (
    <div className="noir-card space-y-3 p-3">
      <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search by title, author, tag…"
            className="pl-9 pr-9"
            aria-label="Search library"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Status filter chips */}
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((s) => {
            const active = prefs.status === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setLibraryPrefs({ status: s.value })}
                aria-pressed={active}
                className={cn("noir-chip cursor-pointer transition", active && "noir-chip-gold")}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Sort select */}
        <div className="relative">
          <label htmlFor="library-sort" className="sr-only">
            Sort
          </label>
          <select
            id="library-sort"
            value={prefs.sort}
            onChange={(e) => setLibraryPrefs({ sort: e.target.value as SortKey })}
            className="noir-btn-ghost inline-flex h-9 cursor-pointer appearance-none items-center gap-2 rounded-lg border border-border bg-transparent pl-3 pr-8 text-sm text-foreground transition hover:text-foreground"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k} className="bg-background text-foreground">
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* View toggle */}
        <div
          className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5"
          role="tablist"
          aria-label="View mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={prefs.view === "grid"}
            onClick={() => setLibraryPrefs({ view: "grid" })}
            className={cn(
              "grid size-8 place-items-center rounded-md transition",
              prefs.view === "grid"
                ? "bg-[color-mix(in_oklab,var(--noir-gold)_18%,transparent)] text-[var(--noir-gold-soft)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Grid view"
          >
            <Grid3x3 className="size-4" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={prefs.view === "list"}
            onClick={() => setLibraryPrefs({ view: "list" })}
            className={cn(
              "grid size-8 place-items-center rounded-md transition",
              prefs.view === "list"
                ? "bg-[color-mix(in_oklab,var(--noir-gold)_18%,transparent)] text-[var(--noir-gold-soft)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="List view"
          >
            <LayoutList className="size-4" />
          </button>
        </div>
      </div>

      {/* Second row: favorites/recent toggles + source-type chips */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() =>
            setLibraryPrefs({ showFavoritesOnly: !prefs.showFavoritesOnly })
          }
          aria-pressed={prefs.showFavoritesOnly}
          className={cn(
            "noir-chip cursor-pointer transition",
            prefs.showFavoritesOnly && "noir-chip-gold",
          )}
        >
          <Heart
            className="size-3"
            fill={prefs.showFavoritesOnly ? "currentColor" : "none"}
          />
          Favorites
        </button>
        <button
          type="button"
          onClick={() =>
            setLibraryPrefs({ showRecentOnly: !prefs.showRecentOnly })
          }
          aria-pressed={prefs.showRecentOnly}
          className={cn(
            "noir-chip cursor-pointer transition",
            prefs.showRecentOnly && "noir-chip-gold",
          )}
        >
          <Clock className="size-3" />
          Recent
        </button>

        {availableSourceTypes.length > 0 ? (
          <>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Type
            </span>
            {availableSourceTypes.map((t) => {
              const active = prefs.sourceTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setLibraryPrefs({
                      sourceTypes: active
                        ? prefs.sourceTypes.filter((x) => x !== t)
                        : [...prefs.sourceTypes, t],
                    })
                  }
                  aria-pressed={active}
                  className={cn(
                    "noir-chip cursor-pointer transition",
                    active && "noir-chip-gold",
                  )}
                >
                  {sourceLabel(t)}
                </button>
              );
            })}
          </>
        ) : null}

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-3" />
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── Grid view ──────────────────────────────────────────────────────────

function DocumentGrid({
  docs,
  onOpen,
  onToggleFavorite,
  onDeleteRequest,
}: {
  docs: DocumentRow[];
  onOpen: (id: string) => void;
  onToggleFavorite: (doc: DocumentRow) => void;
  onDeleteRequest: (doc: DocumentRow) => void;
}): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {docs.map((doc) => (
        <GridCard
          key={doc.id}
          doc={doc}
          onOpen={() => onOpen(doc.id)}
          onToggleFavorite={() => onToggleFavorite(doc)}
          onDeleteRequest={() => onDeleteRequest(doc)}
        />
      ))}
    </div>
  );
}

function GridCard({
  doc,
  onOpen,
  onToggleFavorite,
  onDeleteRequest,
}: {
  doc: DocumentRow;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onDeleteRequest: () => void;
}): ReactNode {
  const progress = Math.min(100, Math.max(0, doc.readingProgress));
  return (
    <article
      className="noir-card noir-card-hover group relative flex cursor-pointer flex-col overflow-hidden"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${doc.title}`}
    >
      {/* Cover */}
      <div
        className="relative aspect-[4/3] w-full"
        style={{ background: coverGradient(doc) }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="noir-chip noir-chip-gold !rounded-md !px-1.5 !py-0.5 !text-[10px] !font-bold !tracking-wider">
            {sourceLabel(doc.sourceType)}
          </span>
          {doc.status === "ready" ? (
            <span
              className="grid size-5 place-items-center rounded-md bg-black/50 text-[var(--noir-gold-soft)]"
              title="Ready to read"
            >
              <CheckCircle2 className="size-3" />
            </span>
          ) : null}
        </div>

        {/* Favorite toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          aria-pressed={doc.favorite}
          aria-label={
            doc.favorite ? "Remove from favorites" : "Add to favorites"
          }
          className={cn(
            "absolute right-2 top-2 grid size-8 place-items-center rounded-full transition",
            doc.favorite
              ? "bg-[color-mix(in_oklab,var(--noir-gold)_22%,transparent)] text-[var(--noir-gold-soft)]"
              : "bg-black/40 text-white/70 hover:text-white",
          )}
        >
          <Heart className="size-4" fill={doc.favorite ? "currentColor" : "none"} />
        </button>

        {/* Hover Read overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
          <span className="noir-btn-gold inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold">
            <BookOpen className="size-3.5" />
            Read
          </span>
        </div>

        {/* Status badge */}
        <div className="absolute inset-x-3 bottom-3">
          <StatusBadge status={doc.status} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 truncate text-sm font-medium leading-snug text-foreground">
            {doc.title}
          </h3>
          {doc.author ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {doc.author}
            </p>
          ) : null}
        </div>
        <div className="mt-auto space-y-2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              <span className="tabular-nums">{doc.chapterCount}</span> ch
            </span>
            <span className="tabular-nums">
              {doc.wordCount.toLocaleString()} words
            </span>
            <span className="tabular-nums">{formatBytes(doc.byteSize)}</span>
          </div>
          {progress > 0 ? (
            <div className="space-y-1">
              <div
                className="noir-progress"
                role="progressbar"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Reading progress"
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="text-right text-[10px] tabular-nums text-muted-foreground">
                {Math.round(progress)}%
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Card menu (delete) */}
      <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 group-hover:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="grid size-7 place-items-center rounded-full bg-black/40 text-white/80 opacity-0 transition group-hover:opacity-100 hover:text-white"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            >
              <BookOpen className="mr-2 size-4" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart className="mr-2 size-4" /> Toggle favorite
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}

// ─── List view ──────────────────────────────────────────────────────────

function DocumentList({
  docs,
  onOpen,
  onToggleFavorite,
  onDeleteRequest,
}: {
  docs: DocumentRow[];
  onOpen: (id: string) => void;
  onToggleFavorite: (doc: DocumentRow) => void;
  onDeleteRequest: (doc: DocumentRow) => void;
}): ReactNode {
  return (
    <div className="noir-card overflow-hidden">
      {/* Header row */}
      <div className="hidden grid-cols-[64px_minmax(0,1fr)_80px_88px_140px_96px_44px] items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
        <span className="text-center">Cover</span>
        <span>Title</span>
        <span className="text-center">Type</span>
        <span className="text-center">Chapters</span>
        <span>Progress</span>
        <span>Last read</span>
        <span className="text-center">Actions</span>
      </div>
      <div className="max-h-[70vh] overflow-y-auto lem-scroll">
        {docs.map((doc) => (
          <ListRow
            key={doc.id}
            doc={doc}
            onOpen={() => onOpen(doc.id)}
            onToggleFavorite={() => onToggleFavorite(doc)}
            onDeleteRequest={() => onDeleteRequest(doc)}
          />
        ))}
      </div>
    </div>
  );
}

function ListRow({
  doc,
  onOpen,
  onToggleFavorite,
  onDeleteRequest,
}: {
  doc: DocumentRow;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onDeleteRequest: () => void;
}): ReactNode {
  const progress = Math.min(100, Math.max(0, doc.readingProgress));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/30 md:grid-cols-[64px_minmax(0,1fr)_80px_88px_140px_96px_44px]"
      aria-label={`Open ${doc.title}`}
    >
      {/* Cover swatch (32x44px on mobile, slightly larger on md) */}
      <div
        className="mx-auto hidden size-8 rounded-md md:block"
        style={{ background: coverGradient(doc) }}
        aria-hidden
      />
      <div
        className="block size-8 rounded-md md:hidden"
        style={{ background: coverGradient(doc) }}
        aria-hidden
      />

      {/* Title + author + (mobile-only meta) */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {doc.title}
          </span>
          {doc.favorite ? (
            <Heart
              className="size-3.5 shrink-0 text-[var(--noir-gold)]"
              fill="currentColor"
            />
          ) : null}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {doc.author ? <span>{doc.author}</span> : null}
          {doc.author ? <span className="mx-1.5">·</span> : null}
          <span>{formatBytes(doc.byteSize)}</span>
          <span className="mx-1.5">·</span>
          <span>{doc.wordCount.toLocaleString()} words</span>
        </div>
        {/* Mobile progress */}
        {progress > 0 ? (
          <div className="mt-2 max-w-xs md:hidden">
            <div
              className="noir-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Type chip */}
      <div className="hidden justify-center md:flex">
        <span className="noir-chip noir-chip-gold !rounded-md !px-1.5 !py-0.5 !text-[10px] !font-bold !tracking-wider">
          {sourceLabel(doc.sourceType)}
        </span>
      </div>

      {/* Chapter count */}
      <div className="hidden text-center text-xs tabular-nums text-muted-foreground md:block">
        <span className="inline-flex items-center gap-1">
          <FileText className="size-3" />
          {doc.chapterCount}
        </span>
      </div>

      {/* Progress */}
      <div className="hidden items-center gap-2 md:flex">
        {progress > 0 ? (
          <>
            <div
              className="noir-progress flex-1"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </div>

      {/* Last read */}
      <div className="hidden truncate text-[11px] text-muted-foreground md:block">
        {doc.lastReadAt
          ? timeAgo(doc.lastReadAt)
          : `Added ${timeAgo(doc.createdAt)}`}
      </div>

      {/* Action menu */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={`Actions for ${doc.title}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            >
              <BookOpen className="mr-2 size-4" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
            >
              <Heart className="mr-2 size-4" />
              {doc.favorite ? "Remove favorite" : "Add favorite"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DocumentRow["status"] }): ReactNode {
  const config: Record<
    DocumentRow["status"],
    { bg: string; fg: string; label: string; icon?: ReactNode }
  > = {
    ready: {
      bg: "color-mix(in oklab, var(--noir-gold) 18%, transparent)",
      fg: "var(--noir-gold-soft)",
      label: "Ready",
    },
    processing: {
      bg: "color-mix(in oklab, #f5f3ee 10%, transparent)",
      fg: "var(--noir-ink-dim, #f5f3ee)",
      label: "Processing",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    error: {
      bg: "color-mix(in oklab, #d94a4a 20%, transparent)",
      fg: "#f5c9c9",
      label: "Error",
      icon: <AlertCircle className="size-3" />,
    },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Empty / loading / error states ─────────────────────────────────────

function LoadingState(): ReactNode {
  return (
    <div className="noir-card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Loader2 className="size-8 animate-spin text-[var(--noir-gold)]" />
      <p className="text-sm text-muted-foreground">Loading your library…</p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): ReactNode {
  return (
    <div className="noir-card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-[color-mix(in_oklab,#d94a4a_18%,transparent)]">
        <AlertCircle className="size-6 text-[#f5c9c9]" />
      </div>
      <p className="noir-display text-xl">Couldn't load your library</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="noir-btn-ghost rounded-full"
      >
        Try again
      </Button>
    </div>
  );
}

function EmptyLibraryState({ onImport }: { onImport: () => void }): ReactNode {
  return (
    <div className="noir-card flex flex-col items-center gap-4 px-6 py-20 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-[color-mix(in_oklab,var(--noir-gold)_12%,transparent)]">
        <BookOpen className="size-8 text-[var(--noir-gold)]" />
      </div>
      <p className="noir-display text-3xl">Your library is empty</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Import your first document to begin — PDFs, EPUBs, Markdown, plain text,
        and HTML are all supported.
      </p>
      <Button
        type="button"
        onClick={onImport}
        className="noir-btn-gold rounded-full px-5"
      >
        <UploadIcon className="size-4" />
        Import your first document
      </Button>
      <p className="text-[11px] text-muted-foreground">
        …or drag and drop a file anywhere on this page.
      </p>
    </div>
  );
}

function NoMatchesState({ onClear }: { onClear: () => void }): ReactNode {
  return (
    <div className="noir-card flex flex-col items-center gap-4 px-6 py-20 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-muted">
        <Search className="size-7 text-muted-foreground" />
      </div>
      <p className="noir-display text-2xl">No documents match your filters</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Try adjusting your search query or clearing the active filters.
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={onClear}
        className="noir-btn-ghost rounded-full"
      >
        <X className="size-4" />
        Clear filters
      </Button>
    </div>
  );
}
