"use client";

import { useMemo, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FileStack,
  FileText,
  HardDrive,
  Hash,
  Loader2,
  Library as LibraryIcon,
  Upload as UploadIcon,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { activityMeta } from "@/lib/activity-meta";
import { useNav } from "@/lib/nav-store";
import {
  useActivity,
  useStats,
  type Stats,
} from "@/hooks/use-api";
import {
  formatBytes,
  SOURCE_LABELS,
  timeAgo,
  type ActivityRow,
  type SourceType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatWordCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function weekdayShort(iso: string): string {
  // iso is "YYYY-MM-DD"; render as Mon/Tue/...
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function isToday(iso: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return iso === today;
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

function CardShell({
  eyebrow,
  title,
  right,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("noir-card p-6", className)}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="noir-eyebrow">{eyebrow}</p>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stat cards                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="noir-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className="flex size-8 items-center justify-center rounded-lg border border-[var(--noir-border)] bg-white/[0.03]">
          <Icon className="size-4 text-[var(--noir-gold)]" />
        </span>
      </div>
      <p className="noir-display mt-3 text-3xl text-foreground">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7-day histogram                                                     */
/* ------------------------------------------------------------------ */

function ActivityHistogram({
  histogram,
}: {
  histogram: { day: string; count: number }[];
}) {
  const max = Math.max(1, ...histogram.map((h) => h.count));
  return (
    <CardShell
      eyebrow="Last 7 days"
      title="Activity histogram"
      right={
        <span className="noir-chip">
          <BarChart3 className="size-3.5" />
          {histogram.reduce((a, h) => a + h.count, 0)} events
        </span>
      }
    >
      <div className="flex h-44 items-end justify-between gap-3">
        {histogram.map((h) => {
          const pct = (h.count / max) * 100;
          const today = isToday(h.day);
          return (
            <div
              key={h.day}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-xs tabular-nums text-muted-foreground">
                {h.count > 0 ? h.count : ""}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition-[height] duration-500",
                    h.count === 0
                      ? "bg-white/[0.05]"
                      : "bg-gradient-to-t from-[var(--noir-gold)] to-[var(--noir-gold-soft)]",
                  )}
                  style={{
                    height: `${Math.max(h.count === 0 ? 4 : 8, pct)}%`,
                    boxShadow: h.count > 0
                      ? "0 8px 24px -10px var(--noir-gold-glow)"
                      : undefined,
                  }}
                  aria-label={`${weekdayShort(h.day)}: ${h.count} events`}
                />
              </div>
              <span
                className={cn(
                  "text-[11px] tracking-wide",
                  today
                    ? "font-semibold text-[var(--noir-gold)]"
                    : "text-muted-foreground",
                )}
              >
                {weekdayShort(h.day)}
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* By source                                                           */
/* ------------------------------------------------------------------ */

const SOURCE_ORDER: SourceType[] = [
  "pdf",
  "epub",
  "docx",
  "md",
  "txt",
  "html",
  "other",
];

function DocumentsBySource({
  bySource,
  total,
}: {
  bySource: Record<string, number>;
  total: number;
}) {
  const rows = SOURCE_ORDER.filter((s) => (bySource[s] ?? 0) > 0).map((s) => ({
    type: s,
    count: bySource[s] ?? 0,
  }));

  if (rows.length === 0) {
    return (
      <CardShell eyebrow="Composition" title="Documents by type">
        <p className="py-8 text-center text-sm text-muted-foreground">
          No documents yet.
        </p>
      </CardShell>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <CardShell
      eyebrow="Composition"
      title="Documents by type"
      right={
        <span className="noir-chip">
          <FileStack className="size-3.5" />
          {total} total
        </span>
      }
    >
      <ul className="space-y-3">
        {rows.map((r) => {
          const pct = (r.count / max) * 100;
          const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <li key={r.type} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">
                  {SOURCE_LABELS[r.type]}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {r.count} · {share}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--noir-gold)] to-[var(--noir-gold-soft)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* Reading status                                                      */
/* ------------------------------------------------------------------ */

function ReadingStatus({
  ready,
  inProgress,
  finished,
}: {
  ready: number;
  inProgress: number;
  finished: number;
}) {
  const items = [
    {
      label: "Ready",
      value: ready,
      icon: CheckCircle2,
      hint: "Parsed and waiting to be opened.",
    },
    {
      label: "In progress",
      value: inProgress,
      icon: Clock,
      hint: "Started but not yet finished.",
    },
    {
      label: "Finished",
      value: finished,
      icon: BookOpen,
      hint: "Read end-to-end at least once.",
    },
  ];
  return (
    <CardShell eyebrow="Lifecycle" title="Reading status">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.label}
              className="space-y-2 rounded-lg border border-border/60 bg-white/[0.02] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </span>
                <Icon className="size-4 text-[var(--noir-gold)]" />
              </div>
              <p className="noir-display text-3xl text-foreground">
                {it.value}
              </p>
              <p className="text-xs text-muted-foreground">{it.hint}</p>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity table                                              */
/* ------------------------------------------------------------------ */

function RecentActivityTable({ rows }: { rows: ActivityRow[] }) {
  const slice = rows.slice(0, 20);
  return (
    <CardShell
      eyebrow="Log"
      title="Recent activity"
      right={
        <span className="noir-chip">
          <Activity className="size-3.5" />
          Last 20
        </span>
      }
    >
      {slice.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No activity logged yet.
        </p>
      ) : (
        <div className="lem-scroll max-h-96 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-[1] bg-[var(--noir-surface)]/95 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="px-3 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {slice.map((row) => {
                const meta = activityMeta(row.type);
                const Icon = meta.icon;
                return (
                  <tr
                    key={row.id}
                    className="transition hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            background: meta.color,
                            boxShadow: `0 0 6px ${meta.color}`,
                          }}
                          aria-hidden
                        />
                        <Icon className="size-3.5 text-muted-foreground" />
                        <span className="text-xs text-foreground">
                          {meta.label}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-middle">
                      <span className="line-clamp-1 text-foreground">
                        {row.documentTitle ?? row.detail ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-middle tabular-nums text-muted-foreground">
                      {timeAgo(row.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="noir-card p-10 text-center">
      <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--noir-border)] bg-white/[0.03]">
        <BarChart3 className="size-5 text-[var(--noir-gold)]" />
      </div>
      <h3 className="noir-display text-2xl text-foreground">
        No analytics yet
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Import a document to start populating your library. Once you have at
        least one file, your reading habits will show up here.
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

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

export default function AnalyticsView() {
  const go = useNav((s) => s.go);
  const { stats, loading } = useStats();
  const { rows: activity, loading: activityLoading } = useActivity(100);

  const statCards = useMemo(() => {
    if (!stats) {
      return [
        { label: "Total documents", value: "—", icon: LibraryIcon, hint: undefined as string | undefined },
        { label: "Total words", value: "—", icon: Hash, hint: undefined },
        { label: "Storage used", value: "—", icon: HardDrive, hint: undefined },
        { label: "Avg progress", value: "—", icon: FileText, hint: undefined },
      ];
    }
    return [
      {
        label: "Total documents",
        value: String(stats.total),
        icon: LibraryIcon,
        hint: `${stats.ready} ready · ${stats.processing} processing`,
      },
      {
        label: "Total words",
        value: formatWordCount(stats.totalWords),
        icon: Hash,
        hint: `Across ${stats.total} document${stats.total === 1 ? "" : "s"}`,
      },
      {
        label: "Storage used",
        value: formatBytes(stats.totalBytes),
        icon: HardDrive,
        hint: `~${formatBytes(stats.total > 0 ? stats.totalBytes / stats.total : 0)} per doc`,
      },
      {
        label: "Avg progress",
        value: `${Math.round(stats.avgProgress * 100)}%`,
        icon: FileText,
        hint: `${stats.finished} finished · ${stats.inProgress} in progress`,
      },
    ];
  }, [stats]);

  const isEmpty = !loading && stats !== null && stats.total === 0;

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader
        breadcrumbs={[
          { label: "Dashboard", onClick: () => go("dashboard") },
          { label: "Analytics" },
        ]}
      />

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeader
          eyebrow="Insights"
          title="Analytics"
          subtitle="Understand your reading habits."
        />

        <div className="mt-8 space-y-6">
          {/* Stat row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((s) => (
              <StatCard
                key={s.label}
                icon={s.icon}
                label={s.label}
                value={s.value}
                hint={s.hint}
              />
            ))}
          </div>

          {loading && stats === null ? (
            <div className="noir-card p-12 text-center">
              <Loader2 className="mx-auto size-6 animate-spin text-[var(--noir-gold)]" />
              <p className="mt-3 text-sm text-muted-foreground">
                Crunching the numbers…
              </p>
            </div>
          ) : isEmpty ? (
            <EmptyState onImport={() => go("upload")} />
          ) : stats ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <ActivityHistogram histogram={stats.histogram} />
                <DocumentsBySource
                  bySource={stats.bySource}
                  total={stats.total}
                />
              </div>

              <ReadingStatus
                ready={stats.ready}
                inProgress={stats.inProgress}
                finished={stats.finished}
              />

              <RecentActivityTable rows={activity} />

              {activityLoading && activity.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Loading recent activity…
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <footer className="mt-10 text-xs text-muted-foreground">
          © 2025 Lemniscate.
        </footer>
      </main>
    </div>
  );
}
