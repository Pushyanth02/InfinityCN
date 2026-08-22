"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Search,
  LayoutGrid,
  List,
  Star,
  Trash2,
  MoreHorizontal,
  BookOpen,
  Upload,
  ScanText,
  Download,
  PlayCircle,
  AlertTriangle,
  Clapperboard,
  Users,
  Quote,
  Loader2,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Check,
  X,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { useNav } from "../lib/store";
import {
  useDocuments,
  deleteDocument,
  setFavorite,
  patchDocument,
  putJob,
} from "../lib/data";
import { seedSampleBooks } from "../lib/seed";
import { getUserId } from "../lib/db";
import { runDeepAnalysis } from "../lib/ai";
import type { AnalysisJob, DeepAnalysis, DocumentRow } from "../lib/types";
import {
  fmtBytes,
  fmtWords,
  sortDocs,
  timeAgo,
  uid,
  download,
} from "../lib/utils";
import {
  Button,
  IconBtn,
  Panel,
  Progress,
  ProgressRing,
  Badge,
  Menu,
  Dialog,
  Select,
  EmptyState,
  Skeleton,
  Eyebrow,
} from "../components/ui";
import { CoverArt } from "../components/bits";
import { toast } from "../lib/store";
import { cx } from "../lib/utils";

export default function Library() {
  const openDoc = useNav((s) => s.openDoc);
  const docsQ = useDocuments();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");
  const [status, setStatus] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [collection, setCollection] = useState("all");
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const [analyzeTarget, setAnalyzeTarget] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);

  const toggleSel = (id: string) =>
    setSelIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelectMode(false);
    setSelIds(new Set());
  };

  /* Esc leaves selection mode from anywhere in the view */
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitSelect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  const bulkStar = async (value: boolean) => {
    const n = selIds.size;
    for (const id of selIds) await setFavorite(id, value);
    toast(
      "success",
      value
        ? `Starred ${n} document${n === 1 ? "" : "s"}.`
        : `Removed stars from ${n} document${n === 1 ? "" : "s"}.`,
    );
    exitSelect();
  };

  const bulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const ids = [...selIds];
      for (const id of ids) await deleteDocument(id);
      toast(
        "info",
        `Deleted ${ids.length} document${ids.length === 1 ? "" : "s"}.`,
      );
      setBulkDeleteOpen(false);
      exitSelect();
    } finally {
      setBulkDeleting(false);
    }
  };
  const collections = useMemo(
    () => [
      ...new Set(docs.map((d) => d.collection).filter((c): c is string => !!c)),
    ],
    [docs],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = docs;
    if (needle) {
      rows = rows.filter(
        (d) =>
          d.title.toLowerCase().includes(needle) ||
          d.author.toLowerCase().includes(needle) ||
          d.tags.some((t) => t.toLowerCase().includes(needle)) ||
          (d.collection ?? "").toLowerCase().includes(needle),
      );
    }
    if (status === "reading")
      rows = rows.filter(
        (d) => d.readingProgress > 0 && d.readingProgress < 99.5,
      );
    if (status === "finished")
      rows = rows.filter((d) => d.readingProgress >= 99.5);
    if (status === "unstarted")
      rows = rows.filter((d) => d.readingProgress === 0);
    if (favOnly) rows = rows.filter((d) => d.favorite);
    if (collection !== "all")
      rows = rows.filter((d) => d.collection === collection);
    return sortDocs(rows, sort);
  }, [docs, q, status, favOnly, collection, sort]);

  const exportText = (d: DocumentRow) => {
    const text = d.contentJson.chapters
      .map((c) => `${c.title}\n\n${c.chunks.map((k) => k.text).join("\n\n")}`)
      .join("\n\n\n");
    download(
      `${d.title.replace(/[^\w\s-]/g, "")}.txt`,
      `${d.title}\n${d.author}\n\n${text}`,
      "text/plain",
    );
    toast("success", `Exported “${d.title}” as plain text.`);
  };

  const menuFor = (d: DocumentRow) => [
    {
      label: d.readingProgress > 0 ? "Resume reading" : "Start reading",
      icon: <PlayCircle className="w-4 h-4" />,
      onClick: () => openDoc(d.id),
    },
    {
      label: d.favorite ? "Unfavorite" : "Favorite",
      icon: <Star className="w-4 h-4" />,
      onClick: () => void setFavorite(d.id, !d.favorite),
    },
    {
      label: "Deep analysis",
      icon: <ScanText className="w-4 h-4" />,
      onClick: () => setAnalyzeTarget(d),
    },
    {
      label: "Export text",
      icon: <Download className="w-4 h-4" />,
      onClick: () => exportText(d),
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      onClick: () => setDeleteTarget(d),
    },
  ];

  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (favOnly ? 1 : 0) +
    (collection !== "all" ? 1 : 0) +
    (sort !== "recent" ? 1 : 0);

  const clearFilters = () => {
    setQ("");
    setStatus("all");
    setFavOnly(false);
    setCollection("all");
    setSort("recent");
  };

  if (docsQ.error) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <EmptyState
          icon={<AlertTriangle className="w-6 h-6" />}
          title="The shelf won’t load"
          body={docsQ.error}
          action={
            <div className="flex gap-3">
              <Button variant="gold" onClick={docsQ.retry}>
                Try again
              </Button>
              <Button variant="outline" onClick={() => location.reload()}>
                Reload app
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 pb-32">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <Eyebrow className="mb-2.5">The stacks</Eyebrow>
          <h1 className="font-display font-semibold text-3xl sm:text-4xl text-mist-100 tracking-tight">
            Library
          </h1>
          <p className="text-sm text-mist-500 mt-2">
            {docs.length} document{docs.length === 1 ? "" : "s"} shelved on this
            device
          </p>
        </div>
        <Button variant="gold" onClick={() => useNav.getState().go("upload")}>
          <Upload className="w-4 h-4" />
          Import
        </Button>
      </div>

      {/* filter rail — mobile */}
      <div className="mt-6 sm:hidden">
        <div className="relative">
          <Search className="w-4 h-4 text-mist-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, author, tags…"
            aria-label="Search library"
            className="w-full rounded-lg border border-ink-600 bg-ink-850/80 backdrop-blur pl-10 pr-3 py-3 text-sm text-mist-100 placeholder:text-mist-600 hover:border-ink-500 focus:border-gold-600 outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-ink-600 bg-ink-850/60 text-xs font-display text-mist-300 hover:text-gold-300 hover:border-gold-700 transition-colors min-h-[44px]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-gold-500/15 text-gold-300 text-[10px]">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={cx(
              "w-3.5 h-3.5 transition-transform",
              filtersOpen && "rotate-180",
            )}
          />
        </button>
        {filtersOpen && (
          <div className="mt-3 grid grid-cols-2 gap-3 p-3 panel rounded-xl">
            <Select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="reading">In progress</option>
              <option value="finished">Finished</option>
              <option value="unstarted">Not started</option>
            </Select>
            {collections.length > 0 && (
              <Select
                aria-label="Filter by collection"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
              >
                <option value="all">All collections</option>
                {collections.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
            <Select
              aria-label="Sort documents"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Most recent</option>
              <option value="title">Title A–Z</option>
              <option value="size">File size</option>
              <option value="progress">Reading progress</option>
            </Select>
            <button
              onClick={() => setFavOnly((f) => !f)}
              aria-pressed={favOnly}
              className={cx(
                "inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-display transition-colors min-h-[44px]",
                favOnly
                  ? "border-gold-600 text-gold-300 bg-gold-500/10"
                  : "border-ink-600 text-mist-400 hover:text-gold-300",
              )}
            >
              <Star
                className={cx(
                  "w-3.5 h-3.5",
                  favOnly && "fill-gold-400 text-gold-400",
                )}
              />
              Starred
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="col-span-2 text-xs text-mist-500 hover:text-gold-300 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            aria-pressed={selectMode}
            className={cx(
              "flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-lg border text-xs font-display transition-colors min-h-[44px]",
              selectMode
                ? "border-gold-600 text-gold-300 bg-gold-500/10"
                : "border-ink-600 text-mist-400 hover:text-gold-300",
            )}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Select{selIds.size > 0 ? ` · ${selIds.size}` : ""}
          </button>
          <div
            className="flex rounded-lg border border-ink-600 overflow-hidden"
            role="group"
            aria-label="View mode"
          >
            <button
              onClick={() => setMode("grid")}
              aria-label="Grid view"
              aria-pressed={mode === "grid"}
              className={cx(
                "p-3 transition-colors",
                mode === "grid"
                  ? "bg-gold-500/15 text-gold-300"
                  : "text-mist-500 hover:text-mist-200",
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMode("list")}
              aria-label="List view"
              aria-pressed={mode === "list"}
              className={cx(
                "p-3 transition-colors",
                mode === "list"
                  ? "bg-gold-500/15 text-gold-300"
                  : "text-mist-500 hover:text-mist-200",
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* filter rail — desktop */}
      <div className="hidden sm:flex mt-8 flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-56">
          <Search className="w-4 h-4 text-mist-600 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, author, tags…"
            aria-label="Search library"
            className="w-full rounded-lg border border-ink-600 bg-ink-850/80 backdrop-blur pl-10 pr-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-600 hover:border-ink-500 focus:border-gold-600 outline-none transition-colors"
          />
        </div>
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-auto py-2.5"
        >
          <option value="all">All statuses</option>
          <option value="reading">In progress</option>
          <option value="finished">Finished</option>
          <option value="unstarted">Not started</option>
        </Select>
        {collections.length > 0 && (
          <Select
            aria-label="Filter by collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="w-auto py-2.5"
          >
            <option value="all">All collections</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        <Select
          aria-label="Sort documents"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="w-auto py-2.5"
        >
          <option value="recent">Most recent</option>
          <option value="title">Title A–Z</option>
          <option value="size">File size</option>
          <option value="progress">Reading progress</option>
        </Select>
        <button
          onClick={() => setFavOnly((f) => !f)}
          aria-pressed={favOnly}
          className={cx(
            "inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-display transition-colors",
            favOnly
              ? "border-gold-600 text-gold-300 bg-gold-500/10"
              : "border-ink-600 text-mist-400 hover:text-gold-300",
          )}
        >
          <Star
            className={cx(
              "w-3.5 h-3.5",
              favOnly && "fill-gold-400 text-gold-400",
            )}
          />
          Starred
        </button>
        <button
          onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
          aria-pressed={selectMode}
          title="Select multiple documents"
          className={cx(
            "inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-xs font-display transition-colors",
            selectMode
              ? "border-gold-600 text-gold-300 bg-gold-500/10"
              : "border-ink-600 text-mist-400 hover:text-gold-300",
          )}
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Select{selIds.size > 0 ? ` · ${selIds.size}` : ""}
        </button>
        <div
          className="flex rounded-lg border border-ink-600 overflow-hidden"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => setMode("grid")}
            aria-label="Grid view"
            aria-pressed={mode === "grid"}
            className={cx(
              "p-2.5 transition-colors",
              mode === "grid"
                ? "bg-gold-500/15 text-gold-300"
                : "text-mist-500 hover:text-mist-200",
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode("list")}
            aria-label="List view"
            aria-pressed={mode === "list"}
            className={cx(
              "p-2.5 transition-colors",
              mode === "list"
                ? "bg-gold-500/15 text-gold-300"
                : "text-mist-500 hover:text-mist-200",
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="mt-6 sm:mt-8">
        {docsQ.loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-5 gap-y-7 sm:gap-y-9">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-60 sm:h-64" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <EmptyLibrary />
        ) : filtered.length === 0 ? (
          <Panel className="p-6 sm:p-10">
            <EmptyState
              icon={<Search className="w-6 h-6" />}
              title="No matches in the stacks"
              body={`Nothing fits ${q ? `“${q}”` : "the current filters"}. Loosen a filter or search for something else.`}
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </Panel>
        ) : mode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-5 gap-y-7 sm:gap-y-9">
            {filtered.map((d) => {
              const selected = selIds.has(d.id);
              return (
                <article
                  key={d.id}
                  className="group cursor-pointer hover-lift"
                  onClick={() => (selectMode ? toggleSel(d.id) : openDoc(d.id))}
                  role={selectMode ? "button" : undefined}
                  aria-pressed={selectMode ? selected : undefined}
                >
                  <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-2">
                    <CoverArt
                      doc={d}
                      className={cx(
                        "h-48 sm:h-52 lg:h-56 w-full shadow-lift transition-all duration-200",
                        selected &&
                          "ring-2 ring-gold-400 ring-offset-2 ring-offset-ink-900 opacity-90",
                      )}
                    />
                    {/* selection checkbox */}
                    {selectMode && (
                      <span
                        aria-hidden
                        className={cx(
                          "absolute top-2.5 left-2.5 w-7 h-7 rounded-lg border flex items-center justify-center transition-all duration-150",
                          selected
                            ? "bg-gold-500 border-gold-400 text-ink-950 scale-100"
                            : "bg-ink-950/70 border-mist-500/60 text-transparent scale-95 group-hover:scale-100",
                        )}
                      >
                        <Check className="w-4 h-4" strokeWidth={3} />
                      </span>
                    )}
                    {/* progress ring over the cover */}
                    {!selectMode && (
                      <div className="absolute -bottom-4 -right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <ProgressRing
                          value={d.readingProgress}
                          size={52}
                          stroke={4.5}
                          tone={d.readingProgress >= 99.5 ? "ok" : "gold"}
                        />
                      </div>
                    )}
                    {!selectMode && (
                      <button
                        aria-label={
                          d.favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          void setFavorite(d.id, !d.favorite);
                        }}
                        className="absolute top-2.5 right-2.5 w-9 h-9 rounded-lg bg-ink-950/60 backdrop-blur-sm flex items-center justify-center transition-colors hover:bg-ink-950/85"
                      >
                        <Star
                          className={cx(
                            "w-4 h-4 transition-colors",
                            d.favorite
                              ? "fill-gold-400 text-gold-400"
                              : "text-mist-300",
                          )}
                        />
                      </button>
                    )}
                    <Badge
                      tone="muted"
                      className="absolute bottom-2.5 left-2.5 bg-ink-950/70 backdrop-blur-sm"
                    >
                      {d.sourceType}
                    </Badge>
                  </div>
                  <div className="pt-3.5 px-0.5">
                    <h2 className="font-display text-sm sm:text-[15px] text-mist-100 leading-snug line-clamp-2 group-hover:text-gold-300 transition-colors">
                      {d.title}
                    </h2>
                    <p className="text-xs text-mist-500 mt-1 truncate">
                      {d.author}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <Progress
                        value={d.readingProgress}
                        className="flex-1"
                        tone={d.readingProgress >= 99.5 ? "ok" : "gold"}
                      />
                      <span className="text-[11px] font-display text-mist-500 tabular-nums w-8 text-right">
                        {Math.round(d.readingProgress)}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-mist-600 truncate">
                        {fmtWords(d.wordCount)} ·{" "}
                        {timeAgo(d.lastReadAt ?? d.createdAt)}
                      </span>
                      {!selectMode && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        >
                          <Menu
                            button={
                              <IconBtn
                                label={`Actions for ${d.title}`}
                                className="w-8 h-8"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </IconBtn>
                            }
                            items={menuFor(d)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Panel className="divide-y divide-ink-700/70 overflow-hidden">
            {filtered.map((d) => {
              const selected = selIds.has(d.id);
              return (
                <div
                  key={d.id}
                  className={cx(
                    "flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 transition-colors cursor-pointer group",
                    selected ? "bg-gold-500/[0.07]" : "hover:bg-ink-800/50",
                  )}
                  onClick={() => (selectMode ? toggleSel(d.id) : openDoc(d.id))}
                >
                  {selectMode && (
                    <span
                      aria-hidden
                      className={cx(
                        "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
                        selected
                          ? "bg-gold-500 border-gold-400 text-ink-950"
                          : "border-ink-500 text-transparent",
                      )}
                    >
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                  <CoverArt
                    doc={d}
                    className="w-10 h-14 sm:w-11 sm:h-[3.75rem] shrink-0"
                    showInitial={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-sm sm:text-[15px] text-mist-100 truncate group-hover:text-gold-300 transition-colors">
                        {d.title}
                      </h2>
                      {d.favorite && (
                        <Star className="w-3.5 h-3.5 fill-gold-400 text-gold-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-mist-500 mt-0.5 truncate">
                      {d.author} · {d.chapterCount} ch · {fmtWords(d.wordCount)}{" "}
                      · {fmtBytes(d.byteSize)}
                    </p>
                  </div>
                  <Badge tone="muted" className="hidden sm:inline-flex">
                    {d.sourceType}
                  </Badge>
                  <div className="w-24 sm:w-32 hidden sm:flex items-center gap-2">
                    <Progress
                      value={d.readingProgress}
                      className="flex-1"
                      tone={d.readingProgress >= 99.5 ? "ok" : "gold"}
                    />
                    <span className="text-[11px] text-mist-500 tabular-nums">
                      {Math.round(d.readingProgress)}%
                    </span>
                  </div>
                  {!selectMode && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    >
                      <Menu
                        button={
                          <IconBtn
                            label={`Actions for ${d.title}`}
                            className="w-8 h-8 sm:w-9 sm:h-9"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </IconBtn>
                        }
                        items={menuFor(d)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
        )}
      </div>

      {/* delete dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove from the shelf?"
      >
        {deleteTarget && (
          <>
            <div className="flex items-start gap-4 mb-4 p-4 rounded-xl border border-ink-700 bg-ink-850/60">
              <CoverArt
                doc={deleteTarget}
                className="w-10 h-14 shrink-0"
                showInitial={false}
              />
              <div className="min-w-0">
                <p className="font-display text-sm text-mist-100 truncate">
                  {deleteTarget.title}
                </p>
                <p className="text-xs text-mist-500 mt-0.5">
                  {deleteTarget.author} · {fmtWords(deleteTarget.wordCount)}
                </p>
              </div>
            </div>
            <p className="text-sm text-mist-400 leading-relaxed">
              This document and its bookmarks, annotations and scenes will be
              deleted from this device. This can’t be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setDeleteTarget(null)}
                className="justify-center"
              >
                Keep it
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await deleteDocument(deleteTarget.id);
                    toast("info", `“${deleteTarget.title}” was deleted.`);
                    setDeleteTarget(null);
                  } finally {
                    setDeleting(false);
                  }
                }}
                className="justify-center"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </>
        )}
      </Dialog>

      <AnalyzeDialog
        doc={analyzeTarget}
        onClose={() => setAnalyzeTarget(null)}
      />

      {/* bulk-action bar */}
      {(selectMode || selIds.size > 0) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-rise w-[min(94vw,640px)] px-2 safe-bottom">
          <div className="panel-glass rounded-xl flex items-center gap-1.5 px-3 py-2.5 shadow-float border-gold-700/50">
            <span className="text-xs font-display text-gold-300 tabular-nums px-2 whitespace-nowrap">
              {selIds.size} selected
            </span>
            <span className="w-px h-5 bg-ink-600" aria-hidden />
            <div className="flex items-center gap-1 overflow-x-auto">
              <Button
                size="sm"
                variant="ghost"
                disabled={selIds.size === 0}
                onClick={() => void bulkStar(true)}
              >
                <Star className="w-3.5 h-3.5" />
                Star
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={selIds.size === 0}
                onClick={() => void bulkStar(false)}
              >
                <Star className="w-3.5 h-3.5" />
                Unstar
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={selIds.size === 0}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            </div>
            <span className="w-px h-5 bg-ink-600 ml-auto" aria-hidden />
            <Button
              size="sm"
              variant="ghost"
              onClick={exitSelect}
              aria-label="Cancel selection"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* bulk delete confirm */}
      <Dialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={`Delete ${selIds.size} document${selIds.size === 1 ? "" : "s"}?`}
      >
        <div className="flex items-start gap-3 mb-4 p-3 rounded-xl border border-danger-500/30 bg-danger-500/[0.06]">
          <AlertTriangle className="w-5 h-5 text-danger-400 shrink-0 mt-0.5" />
          <p className="text-sm text-mist-300 leading-relaxed">
            <span className="text-mist-200">
              {docs
                .filter((d) => selIds.has(d.id))
                .slice(0, 3)
                .map((d) => `“${d.title}”`)
                .join(", ")}
              {selIds.size > 3 ? ` and ${selIds.size - 3} more` : ""}
            </span>{" "}
            — along with their bookmarks, annotations and scenes — will be
            removed from this device. This can’t be undone.
          </p>
        </div>
        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => setBulkDeleteOpen(false)}
            className="justify-center"
          >
            Keep them
          </Button>
          <Button
            variant="danger"
            loading={bulkDeleting}
            onClick={() => void bulkDelete()}
            className="justify-center"
          >
            <Trash2 className="w-4 h-4" />
            Delete {selIds.size}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/* ---------------- empty library (opt-in samples) ---------------- */

/** Shown when this device's library is empty. Samples are loaded ONLY on
 *  explicit request — a fresh visitor never sees fabricated documents or
 *  reading history that could be mistaken for another user's data. */
function EmptyLibrary() {
  const [loading, setLoading] = useState(false);
  return (
    <Panel className="p-6 sm:p-10">
      <EmptyState
        icon={<BookOpen className="w-6 h-6" />}
        title="Nothing on the shelf yet"
        body="Import a document and Lemniscate will turn it into a chapter-aware reading experience with companions, scenes and study tools. Everything stays on this device — nothing is shared."
        action={
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="gold"
              onClick={() => useNav.getState().go("upload")}
            >
              <Upload className="w-4 h-4" />
              Import a document
            </Button>
            <Button
              variant="outline"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await seedSampleBooks();
                  toast("success", "Sample books added to your library.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <BookOpen className="w-4 h-4" />
              Load sample books
            </Button>
          </div>
        }
      />
    </Panel>
  );
}

/* ---------------- deep analysis ---------------- */

const ANALYZE_STEPS = [
  "Denoising & refining",
  "Summarizing",
  "Extracting themes",
  "Mapping characters",
  "Writing criticism",
];

export function AnalyzeDialog({
  doc,
  onClose,
}: {
  doc: DocumentRow | null;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DeepAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) {
      setPhase("idle");
      setResult(null);
      setError(null);
      setStepIdx(0);
      setProgress(0);
      return;
    }
    let on = true;
    const job: AnalysisJob = {
      id: uid("job"),
      documentId: doc.id,
      // Stamp with the real local identity — rows written as "local" are
      // invisible to useJobs(), which filters by the session identity.
      userId: getUserId(),
      status: "running",
      step: ANALYZE_STEPS[0],
      progress: 0,
      etaSec: 8,
      results: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      label: `Deep analysis · ${doc.title}`,
      bot: "ouro",
    };
    void putJob(job);
    setPhase("running");
    runDeepAnalysis(doc, (label, pctv) => {
      if (!on) return;
      setStepIdx(Math.max(0, ANALYZE_STEPS.indexOf(label)));
      setProgress(pctv);
      void putJob({
        ...job,
        step: label,
        progress: pctv,
        etaSec: Math.max(1, Math.round((100 - pctv) / 14)),
        updatedAt: Date.now(),
      });
    })
      .then(async ({ data, offline }) => {
        if (!on) return;
        setResult(data);
        setPhase("done");
        void putJob({
          ...job,
          status: "done",
          progress: 100,
          step: "Complete",
          results: data,
          etaSec: null,
          updatedAt: Date.now(),
        });
        await patchDocument(doc.id, { summary: data.summary });
        toast(
          "success",
          offline ? "Analysis complete (Anchor engine)." : "Analysis complete.",
        );
      })
      .catch((e: unknown) => {
        if (!on) return;
        const msg = e instanceof Error ? e.message : "Analysis failed.";
        setError(msg);
        setPhase("failed");
        void putJob({
          ...job,
          status: "failed",
          error: msg,
          updatedAt: Date.now(),
        });
      });
    return () => {
      on = false;
    };

    // `doc` is intentionally omitted: the analysis must restart only when the
    // document id changes, not on every store bump that mutates the doc's
    // object identity (which would relaunch a long-running analysis).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  return (
    <Dialog
      open={!!doc}
      onClose={onClose}
      title={
        doc ? (
          <>
            Deep analysis — <span className="text-gold-400">{doc.title}</span>
          </>
        ) : (
          ""
        )
      }
      wide
    >
      {phase === "running" && (
        <div className="py-2">
          <div className="flex items-center gap-3 mb-5">
            <Loader2 className="w-5 h-5 animate-spin text-gold-400" />
            <p className="text-sm text-mist-300">Working through the text…</p>
            <span className="ml-auto text-xs font-display text-gold-300 tabular-nums">
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="mb-6" />
          <ol className="space-y-2.5">
            {ANALYZE_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                {i < stepIdx || progress === 100 ? (
                  <CheckCircle2 className="w-4 h-4 text-ok-400" />
                ) : i === stepIdx ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gold-400" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-ink-600 inline-block" />
                )}
                <span
                  className={i <= stepIdx ? "text-mist-200" : "text-mist-600"}
                >
                  {s}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-mist-600 mt-5">
            ETA ~{Math.max(1, Math.round((100 - progress) / 14))}s · results are
            cached on the document
          </p>
        </div>
      )}
      {phase === "failed" && (
        <div className="py-4 text-center">
          <XCircle className="w-8 h-8 text-danger-400 mx-auto mb-3" />
          <p className="text-sm text-mist-300">{error}</p>
          <Button variant="outline" className="mt-5" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
      {phase === "done" && result && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[11px] font-display uppercase tracking-[0.18em] text-gold-400 mb-2">
              Summary
            </h3>
            <p className="text-sm text-mist-300 leading-relaxed font-literata">
              {result.summary}
            </p>
          </section>
          <div className="grid sm:grid-cols-2 gap-6">
            <section>
              <h3 className="text-[11px] font-display uppercase tracking-[0.18em] text-gold-400 mb-2">
                Themes
              </h3>
              <ul className="space-y-2.5">
                {result.themes.map((t) => (
                  <li key={t.name}>
                    <p className="text-sm text-mist-200 font-display">
                      {t.name}
                    </p>
                    <p className="text-xs text-mist-500 leading-relaxed">
                      {t.note}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-[11px] font-display uppercase tracking-[0.18em] text-gold-400 mb-2">
                Characters
              </h3>
              {result.characters.length === 0 ? (
                <p className="text-xs text-mist-500">
                  No recurring figures detected.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {result.characters.map((c) => (
                    <li key={c.name}>
                      <p className="text-sm text-mist-200 font-display inline-flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-gold-500" />
                        {c.name}
                      </p>
                      <p className="text-xs text-mist-500 leading-relaxed line-clamp-2">
                        {c.note}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <section>
            <h3 className="text-[11px] font-display uppercase tracking-[0.18em] text-gold-400 mb-2">
              Criticism
            </h3>
            <p className="text-sm text-mist-300 leading-relaxed font-literata border-l-2 border-gold-700 pl-4">
              <Quote className="w-4 h-4 text-gold-600 inline mr-1 -mt-1" />
              {result.criticism}
            </p>
          </section>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="justify-center"
            >
              <Clapperboard className="w-4 h-4" />
              Read with scenes
            </Button>
            <Button
              variant="gold"
              onClick={() => {
                if (doc) useNav.getState().openDoc(doc.id);
              }}
              className="justify-center"
            >
              Open reader
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
