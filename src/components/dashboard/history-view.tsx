"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  Bookmark,
  Clock,
  Film,
  History as HistoryIcon,
  Library as LibraryIcon,
  MessageSquareQuote,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { useNav } from "@/lib/nav-store";
import { useActivity } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ActivityRow } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type FilterKey = "all" | "reads" | "uploads" | "ai";

const FILTERS: { id: FilterKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "reads", label: "Reads" },
  { id: "uploads", label: "Uploads" },
  { id: "ai", label: "AI actions" },
];

const ACTIVITY_META: Record<
  string,
  { label: string; color: string; icon: typeof Activity }
> = {
  upload: { label: "Imported", color: "var(--noir-gold)", icon: UploadIcon },
  read: { label: "Read", color: "#a78bfa", icon: BookOpen },
  ai_summarize: { label: "Summarized", color: "#60a5fa", icon: Sparkles },
  ai_cinematize: { label: "Cinematized", color: "var(--noir-gold-soft)", icon: Film },
  bookmark: { label: "Bookmarked", color: "#34d399", icon: Bookmark },
  ai_qa: { label: "Asked", color: "#f472b6", icon: MessageSquareQuote },
};

function activityMeta(type: string): {
  label: string;
  color: string;
  icon: typeof Activity;
} {
  return (
    ACTIVITY_META[type] ?? {
      label: type,
      color: "var(--noir-ink-mute)",
      icon: Activity,
    }
  );
}

function isRead(type: string): boolean {
  return type === "read" || type === "bookmark";
}

function isUpload(type: string): boolean {
  return type === "upload";
}

function isAi(type: string): boolean {
  return type.startsWith("ai_");
}

function matchesFilter(type: string, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "reads") return isRead(type);
  if (filter === "uploads") return isUpload(type);
  if (filter === "ai") return isAi(type);
  return true;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

type BucketKey = "today" | "yesterday" | "this-week" | "older";

function bucketKey(iso: string): BucketKey {
  const now = startOfDay(new Date());
  const then = startOfDay(new Date(iso));
  const dayMs = 86_400_000;
  const diffDays = Math.round((now - then) / dayMs);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "this-week";
  return "older";
}

const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This week",
  older: "Older",
};

const BUCKET_ORDER: BucketKey[] = [
  "today",
  "yesterday",
  "this-week",
  "older",
];

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function absoluteLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
/* Filter chips                                                        */
/* ------------------------------------------------------------------ */

function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: FilterKey;
  counts: Record<FilterKey, number>;
  onChange: (k: FilterKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Activity filters"
      className="noir-card flex flex-wrap gap-1 p-1.5"
    >
      {FILTERS.map((f) => {
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(f.id)}
            className={cn(
              "focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition",
              isActive
                ? "noir-btn-gold"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] tabular-nums",
                isActive
                  ? "bg-black/20 text-black/80"
                  : "bg-white/[0.06] text-muted-foreground",
              )}
            >
              {counts[f.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

function TimelineRow({ row }: { row: ActivityRow }) {
  const meta = activityMeta(row.type);
  const Icon = meta.icon;
  const title = row.documentTitle ?? row.detail ?? "Untitled";

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* spine */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border/60" />

      {/* dot */}
      <div className="relative z-[1] flex size-6 shrink-0 items-center justify-center">
        <span
          className="flex size-6 items-center justify-center rounded-full border border-[var(--noir-border)] bg-[var(--noir-surface)]"
          style={{ boxShadow: `0 0 0 3px ${meta.color}22` }}
        >
          <Icon
            className="size-3"
            style={{ color: meta.color }}
          />
        </span>
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm">
              <span className="font-medium text-foreground">{meta.label}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="text-foreground/90">{title}</span>
            </p>
            {row.detail && row.documentTitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.detail}
              </p>
            ) : null}
          </div>
          <time
            dateTime={row.createdAt}
            title={absoluteLabel(row.createdAt)}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {timeLabel(row.createdAt)}
          </time>
        </div>
      </div>
    </li>
  );
}

function TimelineBucket({
  label,
  rows,
}: {
  label: string;
  rows: ActivityRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="noir-eyebrow">{label}</h3>
        <span className="h-px flex-1 bg-border/60" />
        <span className="text-xs tabular-nums text-muted-foreground">
          {rows.length} event{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="pl-1">
        {rows.map((r) => (
          <TimelineRow key={r.id} row={r} />
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

function EmptyAll({ onImport }: { onImport: () => void }) {
  return (
    <div className="noir-card p-12 text-center">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
        <HistoryIcon className="size-5 text-[var(--noir-gold)]" />
      </div>
      <h3 className="noir-display text-2xl text-foreground">
        No activity yet
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Import a document to begin. Every read, summary, and scene you create
        will be recorded here in chronological order.
      </p>
      <Button
        type="button"
        className="noir-btn-gold mt-5"
        onClick={onImport}
      >
        <UploadIcon className="size-4" />
        Import a document
      </Button>
    </div>
  );
}

function EmptyFiltered({
  filter,
  onReset,
}: {
  filter: FilterKey;
  onReset: () => void;
}) {
  const label = FILTERS.find((f) => f.id === filter)?.label ?? "this filter";
  return (
    <div className="noir-card p-10 text-center">
      <Clock className="mx-auto mb-3 size-5 text-muted-foreground" />
      <p className="text-sm text-foreground">
        No {label.toLowerCase()} activity to show.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Try a different filter to see more of your timeline.
      </p>
      <Button
        type="button"
        variant="outline"
        className="noir-btn-ghost mt-4"
        onClick={onReset}
      >
        Show all
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function HistoryView() {
  const go = useNav((s) => s.go);
  const { rows, loading, refresh } = useActivity(100);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Refresh when the view mounts so newly-logged events appear.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: rows.length,
      reads: rows.filter((r) => isRead(r.type)).length,
      uploads: rows.filter((r) => isUpload(r.type)).length,
      ai: rows.filter((r) => isAi(r.type)).length,
    }),
    [rows],
  );

  const filtered = useMemo(
    () => rows.filter((r) => matchesFilter(r.type, filter)),
    [rows, filter],
  );

  const buckets = useMemo(() => {
    const map: Record<BucketKey, ActivityRow[]> = {
      today: [],
      yesterday: [],
      "this-week": [],
      older: [],
    };
    for (const r of filtered) {
      map[bucketKey(r.createdAt)].push(r);
    }
    return map;
  }, [filtered]);

  const hasAny = rows.length > 0;
  const hasFiltered = filtered.length > 0;

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "History" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeader
          eyebrow="Timeline"
          title="Reading History"
          subtitle="Everything you've done, in order."
        />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            active={filter}
            counts={counts}
            onChange={setFilter}
          />
          <Button
            type="button"
            variant="outline"
            className="noir-btn-ghost"
            onClick={() => go("library")}
          >
            <LibraryIcon className="size-4" />
            Open library
          </Button>
        </div>

        <div className="mt-8 space-y-8">
          {loading && !hasAny ? (
            <div className="noir-card p-12 text-center">
              <Clock className="mx-auto size-5 animate-pulse text-[var(--noir-gold)]" />
              <p className="mt-3 text-sm text-muted-foreground">
                Loading timeline…
              </p>
            </div>
          ) : !hasAny ? (
            <EmptyAll onImport={() => go("upload")} />
          ) : !hasFiltered ? (
            <EmptyFiltered
              filter={filter}
              onReset={() => setFilter("all")}
            />
          ) : (
            BUCKET_ORDER.filter((k) => buckets[k].length > 0).map((k) => (
              <TimelineBucket
                key={k}
                label={BUCKET_LABELS[k]}
                rows={buckets[k]}
              />
            ))
          )}
        </div>

        <footer className="mt-12 text-xs text-muted-foreground">
          © 2025 Lemniscate.
        </footer>
      </main>
    </div>
  );
}
