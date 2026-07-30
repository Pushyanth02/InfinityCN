"use client";

import { useMemo, type ReactNode } from "react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Library as LibraryIcon,
  type LucideIcon,
  Sparkles,
  Upload as UploadIcon,
} from "lucide-react";

import { AppHeader } from "@/components/nav/app-header";
import { useActivity, useDocuments, useStats, type Stats } from "@/hooks/use-api";
import { useNav } from "@/lib/nav-store";
import {
  formatBytes,
  gradientForId,
  SOURCE_LABELS,
  timeAgo,
  type ActivityRow,
  type DocumentRow,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(d = new Date()): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatWordCount(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const ACTIVITY_META: Record<string, { label: string; color: string }> = {
  upload: { label: "Imported", color: "var(--noir-gold)" },
  read: { label: "Read", color: "var(--noir-ink)" },
  ai_summarize: { label: "Summarized", color: "#a78bfa" },
  ai_cinematize: { label: "Cinematized", color: "var(--noir-gold)" },
  ai_continue: { label: "Continued the story", color: "#a78bfa" },
  ai_ending: { label: "Reimagined an ending", color: "#f472b6" },
  ai_world: { label: "Expanded the world", color: "#60a5fa" },
  ai_kids: { label: "Retold for kids", color: "#fbbf24" },
  ai_characters_intro: { label: "Met the characters", color: "#34d399" },
  ai_whatif: { label: "Invented what-ifs", color: "#f472b6" },
  ai_imagine: { label: "Imagined pictures", color: "#fbbf24" },
  ai_study: { label: "Built a study guide", color: "#60a5fa" },
  ai_vocab: { label: "Listed vocabulary", color: "#34d399" },
  ai_quiz: { label: "Generated a quiz", color: "#a78bfa" },
  ai_explain: { label: "Explained simply", color: "#60a5fa" },
  ai_themes: { label: "Extracted themes", color: "#a78bfa" },
  bookmark: { label: "Bookmarked", color: "#60a5fa" },
};

function activityMeta(type: string): { label: string; color: string } {
  return ACTIVITY_META[type] ?? { label: type, color: "var(--noir-ink-mute)" };
}

function isFinished(d: DocumentRow): boolean {
  return d.readingProgress >= 0.999;
}

function isInProgress(d: DocumentRow): boolean {
  return d.readingProgress > 0 && !isFinished(d);
}

function hasLastRead(d: DocumentRow): d is DocumentRow & { lastReadAt: string } {
  return Boolean(d.lastReadAt);
}

/* ------------------------------------------------------------------ */
/* Tiny presentational helpers                                        */
/* ------------------------------------------------------------------ */

function GhostButton({
  children,
  onClick,
  className,
  as = "button",
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  as?: "button" | "a";
  href?: string;
}) {
  const cls = cn(
    "noir-btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
    className,
  );
  if (as === "a") {
    return (
      <a href={href} className={cls} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function GoldButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "noir-btn-gold inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
        className,
      )}
    >
      {children}
    </button>
  );
}

function CoverSwatch({
  doc,
  className,
}: {
  doc: DocumentRow;
  className?: string;
}) {
  const grad = doc.coverGradient || gradientForId(doc.id);
  return (
    <div
      className={cn("shrink-0 rounded-md ring-1 ring-white/5", className)}
      style={{ background: grad }}
      aria-hidden
    />
  );
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <main
      id="main-content"
      className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="noir-hero p-6 sm:p-10">
        <div className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted/40" />
          <div className="h-10 w-72 animate-pulse rounded bg-muted/40" />
          <div className="h-3 w-96 max-w-full animate-pulse rounded bg-muted/40" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-muted/40" />
        </div>
      </div>

      <div className="noir-card p-6">
        <div className="h-3 w-32 animate-pulse rounded bg-muted/40" />
        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div className="md:col-span-3 h-64 animate-pulse rounded-lg bg-muted/30" />
          <div className="md:col-span-2 h-64 animate-pulse rounded-lg bg-muted/30" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="noir-card p-6 h-56 animate-pulse rounded-lg bg-muted/20" />
        <div className="noir-card p-6 h-56 animate-pulse rounded-lg bg-muted/20" />
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Greeting Hero                                                   */
/* ------------------------------------------------------------------ */

function GreetingHero({
  docs,
  featuredDoc,
}: {
  docs: DocumentRow[];
  featuredDoc: DocumentRow | null;
}) {
  const { go } = useNav();
  const inProgressCount = docs.filter(isInProgress).length;

  const subtext =
    docs.length === 0
      ? "Your reading room is quiet under the stars. Import a document — or write your own — and Luma will meet you there."
      : `You have ${docs.length} ${docs.length === 1 ? "document" : "documents"} in your library. ${inProgressCount} in progress. Open one to chat with Luma.`;

  return (
    <section className="noir-hero relative overflow-hidden p-6 sm:p-10">
      {/* Cosmic backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 80% at 85% 0%, rgba(124, 58, 237, 0.18), transparent 60%), radial-gradient(50% 60% at 10% 100%, rgba(240, 198, 116, 0.08), transparent 55%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 70% 60%, rgba(196,181,253,0.6), transparent), radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 90% 20%, rgba(240,198,116,0.6), transparent), radial-gradient(1px 1px at 55% 15%, rgba(255,255,255,0.4), transparent)", backgroundSize: "320px 320px", opacity: 0.5 }} />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="noir-eyebrow">{todayLabel()}</p>
          <h1 className="noir-display text-4xl sm:text-5xl lg:text-6xl">
            {greeting()}, Reader.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {subtext}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--noir-border)] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[var(--noir-gold)]" />
              Luma · Story Lover
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--noir-border)] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[var(--noir-gold)]" />
              Luma · Story Time
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--noir-border)] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-[var(--noir-gold)]" />
              Luma · Study Buddy
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GhostButton onClick={() => go("create")}>
            <Sparkles className="h-4 w-4" />
            Create a story
          </GhostButton>
          {featuredDoc ? (
            <GoldButton
              onClick={() => go("reader", { documentId: featuredDoc.id })}
            >
              <BookOpen className="h-4 w-4" />
              Continue reading
            </GoldButton>
          ) : (
            <GoldButton onClick={() => go("upload")}>
              <UploadIcon className="h-4 w-4" />
              Import a document
            </GoldButton>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Continue Reading                                                */
/* ------------------------------------------------------------------ */

function FeaturedDocCard({ doc }: { doc: DocumentRow }) {
  const { go } = useNav();
  const pct = Math.round(doc.readingProgress * 100);
  const currentChapter = Math.max(
    1,
    Math.min(doc.chapterCount, Math.floor(doc.readingProgress * doc.chapterCount) + 1),
  );

  return (
    <div className="noir-card flex h-full flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <CoverSwatch
          doc={doc}
          className="h-28 w-20 sm:h-32 sm:w-24"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="noir-eyebrow">
            {SOURCE_LABELS[doc.sourceType]} · {doc.chapterCount}{" "}
            {doc.chapterCount === 1 ? "chapter" : "chapters"}
          </p>
          <h3 className="noir-display text-2xl leading-tight sm:text-3xl">
            {doc.title}
          </h3>
          {doc.author ? (
            <p className="text-sm text-muted-foreground">by {doc.author}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Chapter {currentChapter} of {doc.chapterCount}
          </span>
          <span className="font-medium text-foreground">{pct}%</span>
        </div>
        <div
          className="noir-progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Reading progress for ${doc.title}`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
        <GoldButton onClick={() => go("reader", { documentId: doc.id })}>
          <BookOpen className="h-4 w-4" />
          Resume
        </GoldButton>
        <GhostButton onClick={() => go("library")}>
          <LibraryIcon className="h-3.5 w-3.5" />
          Browse library
        </GhostButton>
      </div>
    </div>
  );
}

function UpNextList({ docs }: { docs: DocumentRow[] }) {
  const { go } = useNav();
  return (
    <div className="noir-card flex h-full flex-col p-6">
      <p className="noir-eyebrow mb-4">Up next</p>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No other recent additions.
        </p>
      ) : (
        <ul className="flex flex-1 flex-col divide-y divide-[var(--noir-border-soft)]">
          {docs.map((doc) => (
            <li key={doc.id} className="flex-1">
              <button
                type="button"
                onClick={() => go("reader", { documentId: doc.id })}
                className="group flex w-full items-center gap-3 py-3 text-left transition"
              >
                <CoverSwatch doc={doc} className="h-14 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-[var(--noir-gold-soft)]">
                    {doc.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {SOURCE_LABELS[doc.sourceType]} · added {timeAgo(doc.createdAt)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyLibraryCard() {
  const { go } = useNav();
  return (
    <div className="noir-card flex flex-col items-start gap-4 p-8 sm:p-12">
      <span
        className="inline-flex size-12 items-center justify-center rounded-lg"
        style={{
          background: "color-mix(in oklab, var(--noir-gold) 12%, transparent)",
          color: "var(--noir-gold-soft)",
        }}
      >
        <Sparkles className="h-5 w-5" />
      </span>
      <div className="space-y-2">
        <h3 className="noir-display text-2xl sm:text-3xl">
          Welcome to your reading room.
        </h3>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Lemniscate is a quiet, local-first library with an AI companion that
          adapts to the reader you are today. Import a PDF, EPUB, DOCX,
          Markdown or text file — then expand the story as a novel lover,
          retell it warmly for a child, or turn it into study guides and
          quizzes for students.
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <GoldButton onClick={() => go("upload")}>
          <UploadIcon className="h-4 w-4" />
          Import a document
        </GoldButton>
        <GhostButton onClick={() => go("library")}>
          Browse library
        </GhostButton>
      </div>
    </div>
  );
}

function ContinueReadingSection({ docs }: { docs: DocumentRow[] }) {
  const { go } = useNav();

  const { featured, upNext } = useMemo(() => {
    const inProgress = docs
      .filter(isInProgress)
      .filter(hasLastRead)
      .slice()
      .sort(
        (a, b) =>
          new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime(),
      );

    const featuredDoc = inProgress[0] ?? null;

    const excluded = featuredDoc ? new Set([featuredDoc.id]) : new Set<string>();
    const recent = docs
      .filter((d) => !excluded.has(d.id))
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 3);

    return { featured: featuredDoc, upNext: recent };
  }, [docs]);

  if (docs.length === 0) {
    return (
      <section>
        <p className="noir-eyebrow mb-3">Continue reading</p>
        <EmptyLibraryCard />
      </section>
    );
  }

  if (!featured) {
    // Library has docs but nothing in progress yet — show a friendly prompt.
    return (
      <section>
        <p className="noir-eyebrow mb-3">Continue reading</p>
        <div className="noir-card flex flex-col items-start gap-4 p-8 sm:p-10">
          <div className="space-y-2">
            <h3 className="noir-display text-2xl sm:text-3xl">
              Nothing in progress yet.
            </h3>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Pick a document from your library to begin. Your place will be
              saved automatically.
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <GoldButton onClick={() => go("library")}>
              <LibraryIcon className="h-4 w-4" />
              Open library
            </GoldButton>
            <GhostButton onClick={() => go("upload")}>
              Import a document
            </GhostButton>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="noir-eyebrow mb-3">Continue reading</p>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-3">
          <FeaturedDocCard doc={featured} />
        </div>
        <div className="md:col-span-2">
          <UpNextList docs={upNext} />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Recent Activity                                                 */
/* ------------------------------------------------------------------ */

function ActivityRowItem({ row }: { row: ActivityRow }) {
  const meta = activityMeta(row.type);
  const title = row.documentTitle || row.detail || "—";
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          <span className="text-muted-foreground">{meta.label}</span>
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          <span className="font-medium">{title}</span>
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {timeAgo(row.createdAt)}
      </span>
    </li>
  );
}

function RecentActivitySection({ rows }: { rows: ActivityRow[] }) {
  const { go } = useNav();
  const displayed = rows.slice(0, 6);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <p className="noir-eyebrow">Recent activity</p>
        <GhostButton onClick={() => go("history")}>
          View all
          <ArrowRight className="h-3 w-3" />
        </GhostButton>
      </div>
      <div className="noir-card p-6">
        {displayed.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No activity yet — import a document to begin.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--noir-border-soft)]">
            {displayed.map((row) => (
              <ActivityRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Library at a Glance                                             */
/* ------------------------------------------------------------------ */

function StatCell({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Icon
        className="h-4 w-4 shrink-0 text-[var(--noir-gold-soft)] opacity-80"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="noir-display text-lg leading-tight sm:text-xl">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function LibraryGlanceSection({
  docs,
  stats,
}: {
  docs: DocumentRow[];
  stats: Stats | null;
}) {
  const { go } = useNav();

  const total = stats?.total ?? docs.length;
  const totalWords =
    stats?.totalWords ?? docs.reduce((acc, d) => acc + d.wordCount, 0);
  const totalBytes =
    stats?.totalBytes ?? docs.reduce((acc, d) => acc + d.byteSize, 0);
  const finishedCount =
    stats?.finished ?? docs.filter(isFinished).length;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <p className="noir-eyebrow">Library at a glance</p>
        <GhostButton onClick={() => go("analytics")}>
          Open analytics
          <ArrowRight className="h-3 w-3" />
        </GhostButton>
      </div>
      <div className="noir-card p-4 sm:p-6">
        <div className="grid grid-cols-1 divide-y divide-[var(--noir-border-soft)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <StatCell
            icon={LibraryIcon}
            value={`${total}`}
            label={total === 1 ? "document" : "documents"}
          />
          <StatCell
            icon={BookOpen}
            value={formatWordCount(totalWords)}
            label="words"
          />
          <StatCell
            icon={ActivityIcon}
            value={formatBytes(totalBytes)}
            label="stored"
          />
          <StatCell
            icon={Sparkles}
            value={`${finishedCount}`}
            label={finishedCount === 1 ? "finished" : "finished"}
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardView() {
  const { docs, loading } = useDocuments();
  const { rows: activityRows } = useActivity(30);
  const { stats } = useStats();

  const featuredDoc = useMemo(() => {
    return (
      docs
        .filter(isInProgress)
        .filter(hasLastRead)
        .sort(
          (a, b) =>
            new Date(b.lastReadAt).getTime() -
            new Date(a.lastReadAt).getTime(),
        )[0] ?? null
    );
  }, [docs]);

  return (
    <div className="dashboard-noir min-h-dvh">
      <AppHeader />
      {loading ? (
        <LoadingState />
      ) : (
        <main
          id="main-content"
          className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6 lg:px-8"
        >
          <GreetingHero docs={docs} featuredDoc={featuredDoc} />
          <ContinueReadingSection docs={docs} />
          <RecentActivitySection rows={activityRows} />
          <LibraryGlanceSection docs={docs} stats={stats} />
        </main>
      )}
    </div>
  );
}
