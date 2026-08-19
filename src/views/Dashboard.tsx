"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Upload, Library as LibraryIcon, ArrowRight, BookOpen, MessageCircleHeart, BarChart3,
  History as HistoryIcon, PenTool, Clock3, ChevronRight, Layers,
  KeyRound, X, Sparkles, ArrowUpRight,
} from "lucide-react";
import { useNav, usePrefs, useShallow } from "../lib/store";
import { useDocuments, useActivity } from "../lib/data";
import { aiConfigured } from "../lib/ai";
import { fmtBytes, fmtWords, greeting, pct, timeAgo } from "../lib/utils";
import { Button, Panel, ProgressRing, Skeleton, Badge, EmptyState, Reveal, Eyebrow } from "../components/ui";
import { CoverArt, ActivityLine } from "../components/bits";
import type { DocumentRow } from "../lib/types";

const today = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

function chapterOf(doc: DocumentRow): number {
  let acc = 0;
  for (let i = 0; i < doc.contentJson.chapters.length; i++) {
    acc += doc.contentJson.chapters[i].chunks.length;
    if (doc.lastChunkIndex < acc) return i;
  }
  return Math.max(0, doc.contentJson.chapters.length - 1);
}

function minutesLeft(doc: DocumentRow): number {
  return Math.max(1, Math.round(((100 - doc.readingProgress) / 100) * (doc.wordCount / 230)));
}

/* ────────────────────────────────────────────────────────────
   CompanionWhisper — a warm, dismissible invitation to connect
   an OpenRouter key. Shown on the Dashboard when no key is set
   and the user hasn't dismissed it. Persists dismissal in
   localStorage so it doesn't nag users who already know.
   ──────────────────────────────────────────────────────────── */
const WHISPER_DISMISSED_KEY = "lemniscate:whisper-dismissed";

function CompanionWhisper() {
  const go = useNav((s) => s.go);
  const [dismissed, setDismissed] = useState(true);
  const [connected, setConnected] = useState(false);

  /* Read the live key status + dismissal flag after mount — avoids
     SSR/hydration mismatches since both depend on browser storage. */
  useEffect(() => {
    setDismissed(localStorage.getItem(WHISPER_DISMISSED_KEY) === "1");
    setConnected(aiConfigured());
  }, []);

  /* Re-check the key when the Dashboard regains focus (e.g. the user
     set a key in Settings, navigated back, and the component remounts). */
  useEffect(() => {
    const onFocus = () => setConnected(aiConfigured());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (connected || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(WHISPER_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <Reveal delay={0.04}>
      <div className="relative mt-6 sm:mt-8 overflow-hidden rounded-xl border border-gold-700/40 shadow-glow-gold">
        {/* ambient gradient backdrop — warm, inviting, never clinical */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{ background: "linear-gradient(120deg, rgba(217,173,82,0.10) 0%, rgba(109,132,232,0.06) 50%, rgba(219,129,76,0.08) 100%)" }}
        />
        <div className="relative flex flex-col sm:flex-row gap-5 sm:gap-6 p-5 sm:p-6 lg:p-7">
          {/* companion avatars — Luma, Ouro, Ankaa whispering together */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 shrink-0">
            <div className="flex -space-x-2">
              {[
                { c: "#d9ad52", n: "L" },
                { c: "#6d84e8", n: "O" },
                { c: "#db814c", n: "A" },
              ].map((b, i) => (
                <span
                  key={b.n}
                  className="w-9 h-9 rounded-full border-2 border-ink-900 flex items-center justify-center font-display text-xs text-ink-950 font-semibold shadow-md"
                  style={{ background: b.c, zIndex: 3 - i }}
                  aria-hidden
                >
                  {b.n}
                </span>
              ))}
            </div>
            <span className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-600 sm:mt-1">a whisper from the margins</span>
          </div>

          {/* message body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2.5 mb-2">
              <Sparkles className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <h2 className="font-display font-semibold text-lg sm:text-xl text-mist-100 leading-snug">
                The companions are here — but they're whispering.
              </h2>
            </div>
            <p className="text-sm text-mist-400 leading-relaxed max-w-2xl">
              Luma, Ouro and Ankaa are answering you right now with the grounded <span className="text-mist-300">Anchor engine</span> —
              extractive, on-device, always private. Bring an OpenRouter key and they'll <span className="text-gold-300">speak with live voices</span>:
              streaming answers, seminar-grade study sets, and long-form drafts. It takes a minute, costs nothing to try, and the key stays
              only in this tab.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="gold" size="sm" onClick={() => go("settings", { sub: "ai" })}>
                <KeyRound className="w-3.5 h-3.5" />Connect a key
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
              <button
                onClick={dismiss}
                className="text-xs font-display text-mist-500 hover:text-mist-300 transition-colors min-h-[36px] px-2"
              >
                I know — hide this
              </button>
            </div>
          </div>

          {/* dismiss X */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-mist-600 hover:text-mist-200 hover:bg-ink-800/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Reveal>
  );
}

export default function Dashboard() {
  const { go, openDoc } = useNav(useShallow((s) => ({ go: s.go, openDoc: s.openDoc })));
  const docsQ = useDocuments();
  const actQ = useActivity(10);
  // OpenRouter key status — synchronous peek at the in-memory key set via
  // `setSessionKey()` (typically from Settings). When no key is set, the
  // companions fall back to the grounded Anchor engine.
  const connected = aiConfigured();
  const name = usePrefs((s) => s.prefs.profile.name.trim());

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const ready = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);
  const current = useMemo(
    () => ready.filter((d) => d.readingProgress > 0 && d.readingProgress < 99.5).sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0)),
    [ready]
  );
  const upNext = useMemo(
    () => ready.filter((d) => d.readingProgress === 0).sort((a, b) => b.createdAt - a.createdAt),
    [ready]
  );
  const finished = ready.filter((d) => d.readingProgress >= 99.5);
  const totalWords = ready.reduce((a, d) => a + d.wordCount, 0);
  const totalBytes = ready.reduce((a, d) => a + d.byteSize, 0);
  const hero = current[0];

  if (docsQ.loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <Skeleton className="h-5 w-44 mb-4" />
        <Skeleton className="h-14 w-[26rem] max-w-full mb-10" />
        <Skeleton className="h-72 sm:h-64 mb-6" />
        <div className="grid lg:grid-cols-2 gap-6"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
      {/* ------- opening: the reading-room desk ------- */}
      <Reveal>
        <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Eyebrow className="mb-3">{today()} · {greeting().toLowerCase()}</Eyebrow>
            <h1 className="font-display font-semibold text-[2rem] leading-[1.08] sm:text-4xl lg:text-5xl lg:leading-[1.05] text-mist-100 tracking-tight">
              {name
                ? <>Welcome back, <span className="text-gold-400"> {name}.</span></>
                : <>Welcome to your <span className="font-garamond italic font-medium text-gold-400">reading&nbsp;room.</span></>}
            </h1>
            <p className="mt-3 sm:mt-4 text-sm sm:text-[15px] text-mist-400 max-w-xl leading-relaxed">
              Documents become living experiences here — import, read, annotate, and let three
              companions keep you company in the margins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
            <Badge tone={connected ? "ok" : "muted"} className="hidden sm:inline-flex">
              <MessageCircleHeart className="w-3 h-3" />{connected ? "companions online" : "companions offline"}
            </Badge>
            <Button variant="gold" onClick={() => go("upload")} className="flex-1 sm:flex-none justify-center"><Upload className="w-4 h-4" />Import</Button>
            <Button variant="outline" onClick={() => go("library")} className="flex-1 sm:flex-none justify-center"><LibraryIcon className="w-4 h-4" />Library</Button>
          </div>
        </div>
      </Reveal>

      {/* warm invitation to connect an OpenRouter key — dismissible */}
      <CompanionWhisper />

      {ready.length === 0 ? (
        <Reveal delay={0.08} className="mt-10 sm:mt-12">
          <Panel className="p-6 sm:p-10">
            <EmptyState
              icon={<BookOpen className="w-6 h-6" />}
              title="The shelves are empty — for now"
              body="Bring a PDF, EPUB, DOCX, Markdown, TXT or HTML file and Lemniscate will parse it into a calm, chapter-aware reading experience."
              action={<Button variant="gold" onClick={() => go("upload")}><Upload className="w-4 h-4" />Import your first document</Button>}
            />
          </Panel>
        </Reveal>
      ) : (
        <>
          {/* ------- now reading: the open book ------- */}
          <Reveal delay={0.06} className="mt-10 sm:mt-12">
            {hero ? (
              <article className="relative panel rounded-xl overflow-hidden hover-lift">
                {/* layered ambience behind the book */}
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                  <div className="absolute -top-24 -left-16 w-[420px] h-[420px] rounded-full" style={{ background: "radial-gradient(circle, var(--acc-soft), transparent 62%)" }} />
                  <div className="absolute right-0 bottom-0 w-1/2 h-full opacity-[0.18]" style={{ background: hero.coverGradient, maskImage: "linear-gradient(105deg, transparent 30%, black 90%)", WebkitMaskImage: "linear-gradient(105deg, transparent 30%, black 90%)" }} />
                </div>
                <div className="relative flex flex-col md:flex-row gap-6 sm:gap-8 p-5 sm:p-7 lg:p-9">
                  {/* cover + progress ring */}
                  <div className="flex items-center gap-4 md:block md:items-start md:gap-0">
                    <div className="relative shrink-0">
                      <CoverArt doc={hero} className="w-28 sm:w-40 lg:w-44 h-40 sm:h-56 lg:h-60 shadow-lift" />
                      <div className="absolute -bottom-4 -right-3 sm:-bottom-5 sm:-right-5">
                        <ProgressRing value={hero.readingProgress} size={56} stroke={5} tone={hero.readingProgress >= 99.5 ? "ok" : "gold"} />
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 md:pt-1">
                    <div className="flex flex-wrap items-center gap-2.5 mb-3">
                      <Badge tone="gold">Now reading</Badge>
                      <span className="text-[11px] text-mist-600 flex items-center gap-1">
                        <Clock3 className="w-3 h-3" />{hero.lastReadAt ? timeAgo(hero.lastReadAt) : "not opened yet"}
                      </span>
                    </div>
                    <h2 className="font-garamond italic text-2xl sm:text-3xl lg:text-4xl text-mist-100 leading-snug">{hero.title}</h2>
                    <p className="text-sm text-mist-500 mt-1.5">{hero.author}</p>
                    <dl className="mt-5 sm:mt-6 grid grid-cols-3 gap-3 sm:gap-6 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-3">
                      <div>
                        <dt className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-600">Chapter</dt>
                        <dd className="font-display text-lg sm:text-xl text-mist-100 tabular-nums mt-0.5">
                          {chapterOf(hero) + 1}<span className="text-mist-500 text-sm"> / {hero.chapterCount}</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-600">Length</dt>
                        <dd className="font-display text-lg sm:text-xl text-mist-100 tabular-nums mt-0.5">
                          {fmtWords(hero.wordCount).replace(" words", "")}<span className="text-mist-500 text-sm"> words</span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-600">Remaining</dt>
                        <dd className="font-display text-lg sm:text-xl text-mist-100 tabular-nums mt-0.5">
                          ~{minutesLeft(hero)}<span className="text-mist-500 text-sm"> min</span>
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-6 sm:mt-7 flex flex-wrap items-center gap-3">
                      <Button variant="gold" size="lg" onClick={() => openDoc(hero.id)} className="flex-1 sm:flex-none justify-center">
                        <BookOpen className="w-4 h-4" />Resume reading
                      </Button>
                      <Button variant="ghost" onClick={() => go("library")} className="flex-1 sm:flex-none justify-center">
                        Browse shelf<ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ) : (
              <Panel className="p-6 sm:p-8 flex flex-wrap items-center justify-between gap-5">
                <div>
                  <h2 className="font-display text-xl text-mist-100">
                    {finished.length === ready.length ? "Everything on the shelf is finished." : "Nothing mid-read right now."}
                  </h2>
                  <p className="text-sm text-mist-500 mt-1.5">Pick something from the shelf below and settle in.</p>
                </div>
                <Button variant="outline" onClick={() => go("library")}><LibraryIcon className="w-4 h-4" />Browse library</Button>
              </Panel>
            )}
          </Reveal>

          {/* ------- your shelf ------- */}
          <Reveal delay={0.1} className="mt-12 sm:mt-14">
            <div className="flex items-end justify-between gap-4 mb-5">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-gold-500" />
                <h3 className="font-display font-semibold text-lg sm:text-xl text-mist-100">Your shelf</h3>
              </div>
              <button
                onClick={() => go("library")}
                className="text-xs font-display uppercase tracking-[0.16em] text-gold-400 hover:text-gold-300 inline-flex items-center gap-1.5 transition-colors min-h-[40px]"
              >
                All {ready.length}<ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div
              className="flex gap-4 sm:gap-5 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory"
              role="list"
              aria-label="Your shelf"
            >
              {[...current, ...upNext, ...finished].slice(0, 10).map((d, i) => (
                <button
                  key={d.id}
                  role="listitem"
                  onClick={() => openDoc(d.id)}
                  className="group shrink-0 w-28 sm:w-32 text-left focus-visible:outline-none snap-start"
                  style={{ transitionDelay: `${i * 20}ms` }}
                >
                  <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-2 group-hover:rotate-[-1.5deg] group-focus-visible:-translate-y-2">
                    <CoverArt doc={d} className="w-28 sm:w-32 h-40 sm:h-44 shadow-lift" />
                    <div className="absolute inset-x-2 bottom-2">
                      <div className="h-1 rounded-full bg-ink-950/60 overflow-hidden">
                        <div className="h-full rounded-full bg-gold-400" style={{ width: `${d.readingProgress}%` }} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs font-display text-mist-300 leading-snug line-clamp-2 group-hover:text-gold-300 transition-colors">{d.title}</p>
                  <p className="text-[10px] text-mist-600 mt-0.5">{d.readingProgress >= 99.5 ? "finished" : d.readingProgress > 0 ? `${Math.round(d.readingProgress)}%` : "unread"}</p>
                </button>
              ))}
            </div>
          </Reveal>

          {/* ------- glance + activity ------- */}
          <div className="mt-12 sm:mt-14 grid lg:grid-cols-[1.15fr_1fr] gap-5 sm:gap-6 items-start">
            <Reveal delay={0.05}>
              <Panel className="p-5 sm:p-7">
                <div className="flex items-center justify-between mb-5 sm:mb-6">
                  <h3 className="font-display font-semibold text-base sm:text-lg text-mist-100">Library at a glance</h3>
                  <button
                    onClick={() => go("analytics")}
                    className="text-xs font-display uppercase tracking-[0.16em] text-gold-400 hover:text-gold-300 inline-flex items-center gap-1.5 transition-colors min-h-[36px]"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Analytics</span><ChevronRight className="w-3 h-3 sm:hidden" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-y-6 sm:gap-y-8 gap-x-4">
                  <Glance label="Documents" value={String(ready.length)} />
                  <Glance label="Words shelved" value={fmtWords(totalWords).replace(" words", "")} sub="words total" />
                  <Glance label="Finished" value={String(finished.length)} sub={ready.length ? `${pct(finished.length, ready.length)}% of shelf` : undefined} />
                  <Glance label="On device" value={fmtBytes(totalBytes)} sub="local storage" />
                </div>
                <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-ink-700 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg border border-ink-600 bg-ink-800 flex items-center justify-center text-gold-400 shrink-0">
                    <PenTool className="w-4 h-4" />
                  </span>
                  <p className="text-xs text-mist-500 leading-relaxed flex-1">
                    {connected ? "OpenRouter key set — companions answer with live models, metered daily." : "Companions are running grounded Anchor engines. Add your OpenRouter key in Settings for live models."}
                  </p>
                  <Button size="xs" variant="outline" onClick={() => go("settings", { sub: "ai" })} className="shrink-0">
                    {connected ? "Manage" : "Set up"}
                  </Button>
                </div>
              </Panel>
            </Reveal>

            <Reveal delay={0.1}>
              <Panel className="p-5 sm:p-7">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <h3 className="font-display font-semibold text-base sm:text-lg text-mist-100">Recent activity</h3>
                  <button
                    onClick={() => go("history")}
                    className="text-xs font-display uppercase tracking-[0.16em] text-gold-400 hover:text-gold-300 inline-flex items-center gap-1.5 transition-colors min-h-[36px]"
                  >
                    <HistoryIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline">History</span><ChevronRight className="w-3 h-3 sm:hidden" />
                  </button>
                </div>
                {actQ.loading ? (
                  <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
                ) : (actQ.data ?? []).length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-8">
                    <div className="w-12 h-12 rounded-xl border border-ink-600 bg-ink-800 flex items-center justify-center text-mist-500 mb-3">
                      <HistoryIcon className="w-5 h-5" />
                    </div>
                    <p className="text-sm text-mist-400">Quiet so far.</p>
                    <p className="text-xs text-mist-600 mt-1">Open a book and the room will keep a diary.</p>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-[15px] top-2 bottom-2 w-px bg-ink-700" aria-hidden />
                    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                      {(actQ.data ?? []).slice(0, 8).map((a) => <ActivityLine key={a.id} row={a} onOpen={openDoc} dense />)}
                    </div>
                  </div>
                )}
              </Panel>
            </Reveal>
          </div>
        </>
      )}
    </div>
  );
}

function Glance({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-display uppercase tracking-[0.2em] text-mist-600">{label}</p>
      <p className="font-display font-semibold text-[1.6rem] sm:text-[2rem] leading-none text-mist-100 tabular-nums mt-2 truncate">{value}</p>
      {sub && <p className="text-[11px] text-mist-500 mt-1.5">{sub}</p>}
    </div>
  );
}
