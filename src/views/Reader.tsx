import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Settings2, List, MessageSquare, Bookmark, Clapperboard, ChevronLeft,
  ChevronRight, Focus, ArrowLeft, Keyboard,
} from "lucide-react";
import { useNav, usePrefs, useShallow, toast } from "../lib/store";
import { useDoc, useAnnotations, updateProgress, addBookmark, addAnnotation } from "../lib/data";
import { globalChunkCount, chapterAtChunk } from "../lib/engine";
import type { AnnotationColor, AnnotationRow, DocumentRow } from "../lib/types";
import { clamp, cx } from "../lib/utils";
import { IconBtn, Button, Input, Textarea, Dialog, Skeleton } from "../components/ui";
import { CompanionDrawer, ScenesView, ReaderSettingsSheet, ChapterIndexSheet, type CompanionTab } from "./ReaderPanels";

const ANNOTATION_COLORS: Record<AnnotationColor, string> = {
  gold: "rgba(210,168,78,0.28)",
  ouro: "rgba(109,132,232,0.28)",
  ankaa: "rgba(217,126,74,0.28)",
  ok: "rgba(99,180,120,0.28)",
};

const ACCENT_MAP: Record<string, string> = {
  gold: "#b8913f",
  ouro: "#6d84e8",
  ankaa: "#d97e4a",
  ok: "#63b478",
};

export default function Reader() {
  const { docId, sub, go } = useNav(useShallow((s) => ({ docId: s.docId, sub: s.sub, go: s.go })));
  const docQ = useDoc(docId);
  const doc = docQ.data;
  const annotations = useAnnotations(docId);
  const { prefs: rs, setReader } = usePrefs(useShallow((s) => ({ prefs: s.prefs.reader, setReader: s.setReader })));

  const chapters = useMemo(() => doc?.contentJson.chapters ?? [], [doc]);
  const total = doc ? globalChunkCount(chapters) : 0;

  const [chunkIdx, setChunkIdx] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<CompanionTab>("luma");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scenesMode, setScenesMode] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [sel, setSel] = useState<{ gi: number; start: number; end: number; text: string } | null>(null);

  const chunkRefs = useRef(new Map<number, HTMLElement>());
  const saveTimer = useRef<number | null>(null);
  const initialized = useRef(false);
  const ticking = useRef(false);
  const scenesModeRef = useRef(false);
  /* When the reader exits scene mode to jump at a specific chunk (via the
     "View source passage" CTA), the prose paragraphs aren't mounted yet, so
     we can't scrollToChunk immediately. We stash the target gi here and
     run it from an effect once scenesMode flips to false and the article
     mounts its refs. */
  const pendingJumpRef = useRef<number | null>(null);
  useEffect(() => { scenesModeRef.current = scenesMode; }, [scenesMode]);

  const registerChunk = useCallback((gi: number, el: HTMLElement | null) => {
    if (el) chunkRefs.current.set(gi, el);
    else chunkRefs.current.delete(gi);
  }, []);
  const onChunkFocus = useCallback((gi: number) => {
    if (usePrefs.getState().prefs.reader.focusMode) setFocusIdx(gi);
  }, []);

  /* stable per-chunk annotation arrays so memoized paragraphs only
     re-render when their own inputs change */
  const annsMap = useMemo(() => {
    const m = new Map<number, AnnotationRow[]>();
    for (const a of annotations.data ?? []) {
      const arr = m.get(a.chunkIndex) ?? [];
      arr.push(a);
      m.set(a.chunkIndex, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start - b.start);
    return m;
  }, [annotations.data]);

  const { chapterIndex } = chapterAtChunk(chapters, chunkIdx);
  const chapter = chapters[chapterIndex];
  const progress = total > 0 ? ((chunkIdx + 1) / total) * 100 : 0;

  const docKey = doc?.id ?? null;

  /* initialize from persisted position — keyed on stable id, never object identity.
     `doc` and `scrollToChunk` are intentionally omitted: we only want this to
     fire once per document (when docKey changes), and scroll restoration must
     not re-trigger on every background refetch that changes the doc object
     identity. */
  useEffect(() => {
    if (!doc || initialized.current) return;
    initialized.current = true;
    const start = clamp(doc.lastChunkIndex, 0, Math.max(0, total - 1));
    setChunkIdx(start);
    setFocusIdx(start);
    if (sub === "luma") { setDrawerTab("luma"); setDrawerOpen(true); }
    if (sub === "ouro") { setDrawerTab("ouro"); setDrawerOpen(true); }
    requestAnimationFrame(() => scrollToChunk(start, "auto"));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, total, sub]);

  /* debounced progress persistence — depends only on primitives so background
     refetches (which change the doc object identity) can't restart the timer
     into a save→refetch→save loop. */
  useEffect(() => {
    if (!docKey || !initialized.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void updateProgress(docKey, chunkIdx, ((chunkIdx + 1) / Math.max(1, total)) * 100);
    }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [chunkIdx, docKey, total]);

  /* flush-on-unmount: leaving the reader inside the debounce window must not
     lose the reading position */
  const latestPos = useRef({ docKey, chunkIdx, total });
  latestPos.current = { docKey, chunkIdx, total };
  useEffect(
    () => () => {
      const { docKey: dk, chunkIdx: ci, total: t } = latestPos.current;
      if (dk && initialized.current) {
        void updateProgress(dk, ci, ((ci + 1) / Math.max(1, t)) * 100);
      }
    },
    []
  );

  const scrollToChunk = useCallback((gi: number, behavior: ScrollBehavior = "smooth") => {
    const el = chunkRefs.current.get(gi);
    if (el) el.scrollIntoView({ behavior, block: "start" });
  }, []);

  /* scroll tracking */
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        /* In scene view the prose paragraphs aren't mounted, so there are no
           refs to probe — tracking must stay idle or it would snap the reader
           back to chunk 0 (Chapter 1) on every scroll of the scene cards. */
        if (scenesModeRef.current || chunkRefs.current.size === 0) return;
        const probe = window.innerHeight * 0.38;
        let best = -1;
        let bestDist = Infinity;
        chunkRefs.current.forEach((el, gi) => {
          const rect = el.getBoundingClientRect();
          const d = Math.abs(rect.top - probe);
          if (d < bestDist) { bestDist = d; best = gi; }
        });
        if (best === -1) return;
        setChunkIdx((cur) => (cur === best ? cur : best));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const gotoChapter = useCallback((idx: number) => {
    if (!chapters.length) return;
    const target = clamp(idx, 0, chapters.length - 1);
    const gi = chapters[target].startChunk;
    setChunkIdx(gi);
    setFocusIdx(gi);
    if (scenesModeRef.current) {
      // prose refs are unmounted in scene view — bring the new chapter's
      // scenes into view from the top instead
      window.scrollTo({ top: 0, behavior: "auto" });
    } else {
      scrollToChunk(gi);
    }
  }, [chapters, scrollToChunk]);

  const jumpToChunk = useCallback((gi: number) => {
    setChunkIdx(gi);
    setFocusIdx(gi);
    scrollToChunk(gi);
  }, [scrollToChunk]);

  /* Exit scene view and scroll the reader to a specific chunk within the
     current chapter. Used by ScenesView's "View source passage" CTA. The
     actual scroll happens in the pending-jump effect below — once scenesMode
     flips to false and the article mounts its chunk refs. */
  const exitSceneToChunk = useCallback((localIdx: number) => {
    const ch = chapters[chapterIndex];
    if (!ch) { setScenesMode(false); return; }
    const clamped = clamp(localIdx, 0, Math.max(0, ch.chunks.length - 1));
    pendingJumpRef.current = ch.startChunk + clamped;
    setScenesMode(false);
  }, [chapters, chapterIndex]);

  /* Perform the deferred source-passage jump once the prose paragraphs
     have mounted (scenesMode just flipped to false). Refs are populated
     synchronously during React's commit phase, so by the time this effect
     fires chunkRefs.current.get(gi) is ready. */
  useEffect(() => {
    if (scenesMode) return;
    const gi = pendingJumpRef.current;
    if (gi === null) return;
    pendingJumpRef.current = null;
    setChunkIdx(gi);
    setFocusIdx(gi);
    // Two rAFs guarantee the prose paragraphs are mounted and registered
    // before we probe their offsetTop — a single rAF can fire mid-commit
    // on slower devices.
    const id = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => scrollToChunk(gi))
    );
    return () => window.cancelAnimationFrame(id);
  }, [scenesMode, scrollToChunk]);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && e.altKey) { e.preventDefault(); gotoChapter(chapterIndex + 1); }
      else if (e.key === "ArrowLeft" && e.altKey) { e.preventDefault(); gotoChapter(chapterIndex - 1); }
      else if (e.key === "b" || e.key === "B") setBmOpen(true);
      else if (e.key === "f" || e.key === "F") setReader({ focusMode: !rs.focusMode });
      else if (e.key === "t" || e.key === "T") setTocOpen(true);
      else if (e.key === "l" || e.key === "L") { setDrawerTab("luma"); setDrawerOpen(true); }
      else if (e.key === "s" || e.key === "S") setScenesMode((v) => !v);
      else if (e.key === "/") { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === "?") setHintsOpen(true);
      else if (e.key === "Escape") { setSel(null); setBmOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapterIndex, gotoChapter, rs.focusMode, setReader]);

  /* text selection → annotation candidate */
  const onMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) { setSel(null); return; }
    const range = selection.getRangeAt(0);
    const startEl = range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
    const node = startEl?.closest("[data-gi]");
    if (!node) return;
    const gi = Number((node as HTMLElement).dataset.gi);
    const chunkText = node.textContent ?? "";
    const selText = selection.toString().trim();
    if (selText.length < 2 || selText.length > 400) return;
    const start = chunkText.indexOf(selText);
    if (start === -1) return;
    setSel({ gi, start, end: start + selText.length, text: selText });
  }, []);

  if (docQ.loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="space-y-3 mb-10">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-1 w-16 mt-3" />
        </div>
        {[...Array(8)].map((_, i) => <Skeleton key={i} className={cx("mb-5", i % 3 === 0 ? "h-4 w-full" : i % 3 === 1 ? "h-4 w-11/12" : "h-4 w-4/5")} />)}
      </div>
    );
  }
  if (docQ.error || !doc) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ink-850 border border-ink-600 mb-6">
          <BookMark />
        </div>
        <p className="font-display text-xl text-mist-200 mb-2">This page isn’t in your reading room.</p>
        <p className="text-sm text-mist-500 mb-7 max-w-sm mx-auto">{docQ.error ?? "The document could not be found."}</p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Button variant="gold" onClick={docQ.retry}>Try again</Button>
          <Button variant="outline" onClick={() => go("library")}><ArrowLeft className="w-4 h-4" />Back to library</Button>
        </div>
      </div>
    );
  }

  const prevChapter = chapters[chapterIndex - 1];
  const nextChapter = chapters[chapterIndex + 1];
  const atStart = chapterIndex === 0;
  const atEnd = chapterIndex >= chapters.length - 1;

  return (
    <div
      className="reader-scope min-h-[calc(100vh-3.5rem)]"
      data-rtheme={rs.theme}
      data-rcontrast={rs.contrast}
      style={{ background: "var(--r-bg)", color: "var(--r-fg)", "--r-accent": ACCENT_MAP[rs.accent] ?? ACCENT_MAP.gold } as React.CSSProperties}
    >
      {/* ───────── reader toolbar — glass overlay, responsive ───────── */}
      <div
        className="sticky top-14 z-30 panel-glass border-b"
        style={{ borderColor: "var(--r-border)" }}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-5 lg:px-6 h-14 flex items-center gap-1.5 sm:gap-2">
          <IconBtn label="Back to library" onClick={() => go("library")} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </IconBtn>

          <div className="min-w-0 flex-1 px-1">
            <p className="text-[12px] sm:text-[13px] font-display truncate leading-tight" style={{ color: "var(--r-muted)" }}>
              <span className="text-[var(--r-fg)] font-medium">{doc.title}</span>
              <span className="mx-1.5 opacity-40">·</span>
              <span className="hidden sm:inline">{chapter?.title}</span>
              <span className="sm:hidden">Ch. {chapterIndex + 1}</span>
            </p>
          </div>

          {/* Primary toolbar cluster — icons always visible */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <IconBtn label="Search in document ( / )" onClick={() => setSearchOpen((v) => !v)} active={searchOpen}>
              <Search className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Cinematic scene view (s)" onClick={() => setScenesMode((v) => !v)} active={scenesMode}>
              <Clapperboard className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Focus mode (f)" onClick={() => setReader({ focusMode: !rs.focusMode })} active={rs.focusMode}>
              <Focus className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Chapter index (t)" onClick={() => setTocOpen(true)}>
              <List className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Companions — Luma, Ouro & Ankaa (l)" onClick={() => { setDrawerOpen(true); }} active={drawerOpen}>
              <MessageSquare className="w-4 h-4" />
            </IconBtn>
            {/* Settings only on sm+ — hidden behind drawer on mobile */}
            <IconBtn label="Reader settings" onClick={() => setSettingsOpen(true)} className="hidden sm:inline-flex">
              <Settings2 className="w-4 h-4" />
            </IconBtn>
            {rs.kbdHints && (
              <IconBtn label="Keyboard shortcuts ( ? )" onClick={() => setHintsOpen(true)} className="hidden md:inline-flex">
                <Keyboard className="w-4 h-4" />
              </IconBtn>
            )}
          </div>
        </div>

        {/* sleeker progress bar — gradient with subtle glow */}
        <div className="relative h-[3px] w-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--r-border) 60%, transparent)" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-r-full transition-[width] duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, color-mix(in srgb, var(--r-accent) 60%, transparent), var(--r-accent))",
              boxShadow: "0 0 8px color-mix(in srgb, var(--r-accent) 70%, transparent)",
            }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Reading progress"
          />
        </div>

        {searchOpen && <DocSearch doc={doc} onJump={jumpToChunk} onClose={() => setSearchOpen(false)} />}
      </div>

      {/* ───────── content ───────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-14">
        {scenesMode ? (
          <ScenesView doc={doc} chapterIndex={chapterIndex} onExit={() => setScenesMode(false)} onExitToChunk={exitSceneToChunk} onPrev={() => gotoChapter(chapterIndex - 1)} onNext={() => gotoChapter(chapterIndex + 1)} />
        ) : (
          <article onMouseUp={onMouseUp}>
            <header className="mb-10 sm:mb-14 relative">
              {/* ghost numeral behind the title */}
              <span
                aria-hidden
                className="absolute -top-9 -left-3 font-garamond italic font-semibold leading-none select-none pointer-events-none hidden sm:block"
                style={{ fontSize: "7.5rem", color: "var(--r-fg)", opacity: 0.06 }}
              >
                {chapterIndex + 1}
              </span>
              <div className="flex items-center gap-3 mb-3 relative">
                <span className="text-[10px] sm:text-[11px] font-display uppercase tracking-[0.26em]" style={{ color: "var(--r-accent)" }}>
                  Chapter {chapterIndex + 1}
                </span>
                <span className="text-[10px] sm:text-[11px] font-display tracking-[0.18em] opacity-50" style={{ color: "var(--r-muted)" }}>
                  of {chapters.length}
                </span>
              </div>
              <h1 className="font-garamond italic text-3xl sm:text-[2.6rem] leading-tight relative" style={{ color: "var(--r-fg)" }}>
                {chapter?.title}
              </h1>
              <div className="gold-rule mt-6 max-w-24" style={{ opacity: 0.7 }} />
            </header>

            <div
              className="reader-prose mx-auto"
              style={{
                maxWidth: `${rs.width}ch`,
                fontFamily: `var(--font-${rs.fontFamily})`,
                fontSize: `${rs.fontSize}px`,
                lineHeight: rs.lineHeight,
                letterSpacing: `${rs.letterSpacing / 100}em`,
              }}
            >
              {chapter?.chunks.map((chunk) => {
                const localIdx = Number(chunk.id.split(":")[1]);
                const gi = chapter.startChunk + localIdx;
                const anns = annsMap.get(gi) ?? EMPTY_ANNS;
                const dist = focusIdx === null ? 0 : Math.abs(gi - focusIdx);
                const dim = rs.focusMode ? (dist === 0 ? 1 : dist === 1 ? 0.45 : 0.22) : 1;
                return (
                  <ChunkP
                    key={chunk.id}
                    gi={gi}
                    text={chunk.text}
                    dim={dim}
                    dropcap={localIdx === 0 && anns.length === 0}
                    anns={anns}
                    activeStart={sel && sel.gi === gi ? sel.start : null}
                    registerRef={registerChunk}
                    onFocus={onChunkFocus}
                  />
                );
              })}
            </div>

            {/* ───────── chapter navigation — responsive, always reachable ───────── */}
            <nav
              className="mx-auto mt-14 sm:mt-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4"
              style={{ maxWidth: `${rs.width}ch` }}
              aria-label="Chapter navigation"
            >
              <Button variant="outline" disabled={atStart} onClick={() => gotoChapter(chapterIndex - 1)} className="justify-start sm:justify-center w-full sm:w-auto">
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="min-w-0 truncate text-left">
                  <span className="block text-[9px] font-display uppercase tracking-[0.2em] opacity-60 -mb-0.5">Previous</span>
                  {prevChapter ? truncate(prevChapter.title, 22) : "Start"}
                </span>
              </Button>

              <div className="flex items-center justify-center gap-3 shrink-0">
                <button
                  onClick={() => setBmOpen(true)}
                  className="group inline-flex flex-col items-center gap-1 text-[11px] font-display uppercase tracking-[0.18em] transition-colors px-3 py-1.5 rounded-lg hover:bg-ink-750/40"
                  style={{ color: "var(--r-muted)" }}
                  aria-label="Bookmark this passage"
                >
                  <Bookmark className="w-4 h-4 group-hover:text-[var(--r-accent)] transition-colors" />
                  <span className="hidden sm:inline">Bookmark</span>
                </button>
              </div>

              <Button variant={atEnd ? "outline" : "gold"} disabled={atEnd} onClick={() => gotoChapter(chapterIndex + 1)} className="justify-end sm:justify-center w-full sm:w-auto">
                <span className="min-w-0 truncate text-right">
                  <span className="block text-[9px] font-display uppercase tracking-[0.2em] opacity-60 -mb-0.5">Next</span>
                  {nextChapter ? truncate(nextChapter.title, 22) : "End"}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </Button>
            </nav>

            {/* Mobile-only floating settings shortcut */}
            <div className="sm:hidden mt-10 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="w-4 h-4" />Reader settings
              </Button>
            </div>
          </article>
        )}
      </div>

      {/* annotation popover */}
      {sel && !scenesMode && (
        <AnnotationPopover
          sel={sel}
          anchorEl={chunkRefs.current.get(sel.gi)}
          onSave={async (note, color) => {
            await addAnnotation({ documentId: doc.id, chunkIndex: sel.gi, start: sel.start, end: sel.end, text: sel.text, note, color });
            setSel(null);
            window.getSelection()?.removeAllRanges();
            toast("success", "Annotation saved.");
          }}
          onClose={() => { setSel(null); window.getSelection()?.removeAllRanges(); }}
        />
      )}

      {/* bookmark dialog */}
      <BookmarkDialog open={bmOpen} onClose={() => setBmOpen(false)} onSave={async (label, note) => { await addBookmark(doc.id, chunkIdx, label, note); setBmOpen(false); }} chunkText={currentChunkText(doc, chunkIdx)} />

      {/* hints */}
      <Dialog open={hintsOpen} onClose={() => setHintsOpen(false)} title="Keyboard shortcuts">
        <ul className="space-y-2.5 text-sm text-mist-300">
          {[["alt + →", "Next chapter"], ["alt + ←", "Previous chapter"], ["b", "Bookmark this passage"], ["f", "Toggle focus mode"], ["s", "Toggle scene view"], ["t", "Chapter index"], ["l", "Open companions (Luma · Ouro · Ankaa)"], ["/", "Search in document"], ["?", "This panel"]].map(([k, d]) => (
            <li key={k} className="flex items-center justify-between gap-4"><span className="text-mist-400">{d}</span><kbd>{k}</kbd></li>
          ))}
        </ul>
      </Dialog>

      <ChapterIndexSheet open={tocOpen} onClose={() => setTocOpen(false)} doc={doc} chapterIndex={chapterIndex} onJumpChapter={gotoChapter} onJumpChunk={jumpToChunk} />
      <CompanionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} doc={doc} chapterIndex={chapterIndex} tab={drawerTab} setTab={setDrawerTab} selection={sel?.text ?? null} />
      <ReaderSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ---------------- helpers ---------------- */

const EMPTY_ANNS: AnnotationRow[] = [];

function BookMark() {
  return <Bookmark className="w-7 h-7 text-gold-500" />;
}

/** Memoized reading paragraph. Identity-stable props mean focus dimming and
 *  selection only re-render the paragraphs they actually touch. */
const ChunkP = memo(function ChunkP({ gi, text, dim, anns, activeStart, dropcap, registerRef, onFocus }: {
  gi: number;
  text: string;
  dim: number;
  anns: AnnotationRow[];
  activeStart: number | null;
  dropcap?: boolean;
  registerRef: (gi: number, el: HTMLElement | null) => void;
  onFocus: (gi: number) => void;
}) {
  return (
    <p
      data-gi={gi}
      ref={(el) => registerRef(gi, el)}
      onMouseEnter={() => onFocus(gi)}
      onClick={() => onFocus(gi)}
      className={cx("mb-[1.35em] cursor-text", dropcap && "dropcap")}
      style={{ opacity: dim }}
    >
      {anns.length ? renderAnnotated(text, anns, activeStart) : text}
    </p>
  );
});

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function currentChunkText(doc: DocumentRow, gi: number): string {
  for (const ch of doc.contentJson.chapters) {
    if (gi < ch.startChunk + ch.chunks.length) return ch.chunks[gi - ch.startChunk]?.text ?? "";
  }
  return "";
}

function renderAnnotated(text: string, anns: AnnotationRow[], activeStart: number | null) {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let lastEnd = 0;
  for (const a of anns) {
    if (a.start < lastEnd) continue; // skip overlaps for render sanity
    if (a.start > cursor) out.push(text.slice(cursor, a.start));
    out.push(
      <mark
        key={a.id}
        title={a.note || a.text}
        data-active={activeStart === a.start ? "true" : "false"}
        style={{ background: ANNOTATION_COLORS[a.color] }}
      >
        {text.slice(a.start, a.end)}
      </mark>
    );
    cursor = a.end;
    lastEnd = a.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/* ---------------- in-document search ---------------- */

function Highlighted({ snippet, needle }: { snippet: string; needle: string }) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = snippet.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === needle.toLowerCase() ? (
          <mark key={i} style={{ background: "var(--r-mark)", color: "inherit" }}>{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function DocSearch({ doc, onJump, onClose }: { doc: DocumentRow; onJump: (gi: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: { gi: number; chapter: string; snippet: string }[] = [];
    for (const ch of doc.contentJson.chapters) {
      ch.chunks.forEach((c, i) => {
        const idx = c.text.toLowerCase().indexOf(needle);
        if (idx !== -1 && out.length < 60) {
          out.push({ gi: ch.startChunk + i, chapter: ch.title, snippet: c.text.slice(Math.max(0, idx - 40), idx + needle.length + 60) });
        }
      });
    }
    return out;
  }, [q, doc]);

  return (
    <div className="border-t panel-glass" style={{ borderColor: "var(--r-border)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-5 py-3">
        <div className="flex items-center gap-2.5">
          <Search className="w-4 h-4 shrink-0" style={{ color: "var(--r-muted)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && results[0]) { onJump(results[0].gi); onClose(); } }}
            placeholder="Search within this document…"
            aria-label="Search within document"
            className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-50 min-w-0"
            style={{ color: "var(--r-fg)" }}
          />
          <span className="text-[11px] font-display tabular-nums shrink-0 hidden sm:inline" style={{ color: "var(--r-muted)" }}>{q.trim().length >= 2 ? `${results.length} found` : ""}</span>
          <button onClick={onClose} aria-label="Close search" className="text-[11px] font-display uppercase tracking-widest opacity-60 hover:opacity-100 shrink-0 px-2 py-1 rounded hover:bg-ink-750/50 transition-colors">esc</button>
        </div>
        {results.length > 0 && (
          <ul className="mt-3 max-h-56 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
            {results.map((r) => (
              <li key={r.gi}>
                <button onClick={() => { onJump(r.gi); onClose(); }} className="w-full text-left px-3 py-2 rounded-lg transition-colors hover:bg-[var(--r-mark)]">
                  <span className="block text-[10px] font-display uppercase tracking-[0.14em] opacity-60">{r.chapter}</span>
                  <span className="block text-[13px] leading-snug opacity-90">…<Highlighted snippet={r.snippet} needle={q.trim()} />…</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- annotation popover ---------------- */

function AnnotationPopover({ sel, anchorEl, onSave, onClose }: {
  sel: { gi: number; start: number; end: number; text: string };
  anchorEl: HTMLElement | undefined;
  onSave: (note: string, color: AnnotationColor) => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [color, setColor] = useState<AnnotationColor>("gold");
  const [saving, setSaving] = useState(false);
  const rect = anchorEl?.getBoundingClientRect();
  const top = rect ? Math.min(rect.top + 40, window.innerHeight - 280) : 120;

  return (
    <div className="fixed z-[60] w-[min(92vw,360px)] panel p-4 sm:p-5 shadow-lift rounded-xl animate-[rise_0.3s_cubic-bezier(0.22,1,0.36,1)_both]" style={{ left: "50%", transform: "translateX(-50%)", top }} role="dialog" aria-label="New annotation">
      <p className="text-[10px] font-display uppercase tracking-[0.18em] text-mist-500 mb-2.5">Annotate passage</p>
      <p className="text-xs text-mist-400 italic font-literata line-clamp-2 border-l-2 border-gold-700 pl-2.5 mb-3 leading-relaxed">“{sel.text}”</p>
      <Textarea rows={2} placeholder="Your note (optional)…" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      <div className="flex items-center gap-2 mt-3.5">
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Highlight color">
          {(Object.keys(ANNOTATION_COLORS) as AnnotationColor[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`${c} highlight`}
              onClick={() => setColor(c)}
              className={cx("w-7 h-7 rounded-full border-2 transition-transform press", color === c ? "border-mist-100 scale-110" : "border-transparent hover:scale-105")}
              style={{ background: ANNOTATION_COLORS[c].replace("0.28", "0.9") }}
            />
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="gold" loading={saving} onClick={async () => { setSaving(true); try { await onSave(note.trim(), color); } finally { setSaving(false); } }}>Save</Button>
      </div>
    </div>
  );
}

/* ---------------- bookmark dialog ---------------- */

function BookmarkDialog({ open, onClose, onSave, chunkText }: { open: boolean; onClose: () => void; onSave: (label: string, note: string) => Promise<void>; chunkText: string }) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setLabel(""); setNote(""); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Bookmark className="w-4 h-4 text-gold-400" />Bookmark this passage</span>}>
      <p className="text-xs text-mist-500 italic font-literata line-clamp-3 border-l-2 border-gold-700 pl-3 mb-5 leading-relaxed">“{truncate(chunkText, 180)}”</p>
      <div className="space-y-4">
        <Input label="Label" placeholder="e.g. The knock scene" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Textarea label="Note" rows={2} placeholder="Why does this matter?" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
        <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
        <Button variant="gold" loading={saving} onClick={async () => { setSaving(true); try { await onSave(label.trim(), note.trim()); } finally { setSaving(false); } }} className="w-full sm:w-auto">
          <Bookmark className="w-4 h-4" />Save bookmark
        </Button>
      </div>
    </Dialog>
  );
}
