"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Settings, UserCircle2, Menu, ArrowLeft, Upload, PenLine, BookOpen, LayoutDashboard, BarChart3, History as HistoryIcon, FilePlus2, Activity as ActivityIcon, Loader2, CheckCircle2, XCircle, Circle, Trash2 } from "lucide-react";
import { useNav, useShallow } from "../lib/store";
import { useDocuments, useDoc, useJobs } from "../lib/data";
import { idbAll, idbDelete } from "../lib/db";
import { bump } from "../lib/data";
import type { AnalysisJob } from "../lib/types";
import type { View } from "../lib/types";
import { cx, fmtClock } from "../lib/utils";
import { BrandMark } from "./brand";
import { IconBtn, Sheet, Badge, Progress } from "./ui";

const VIEW_LABELS: Record<View, string> = {
  landing: "Home",
  dashboard: "Dashboard",
  library: "Library",
  upload: "Import",
  reader: "Reader",
  settings: "Settings",
  account: "Account",
  analytics: "Analytics",
  history: "History",
  create: "Writing desk",
};

export function AppHeader() {
  const { view, docId, go, back } = useNav(useShallow((s) => ({ view: s.view, docId: s.docId, go: s.go, back: s.back })));
  const doc = useDoc(view === "reader" ? docId : null);
  const jobsQ = useJobs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const liveJobs = useMemo(
    () => (jobsQ.data ?? []).filter((j) => j.status === "running" || j.status === "queued"),
    [jobsQ.data]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const links: { view: View; label: string; icon: typeof BookOpen }[] = [
    { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { view: "library", label: "Library", icon: BookOpen },
    { view: "create", label: "Create", icon: PenLine },
    { view: "analytics", label: "Insights", icon: BarChart3 },
  ];

  const crumb = view === "reader" && doc.data ? doc.data.title : VIEW_LABELS[view];

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-ink-700/60 bg-ink-900/85 backdrop-blur-xl safe-top">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-3">
          {/* Mobile menu button */}
          <IconBtn label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </IconBtn>

          <button onClick={() => go("dashboard")} className="flex items-center gap-2 group shrink-0" aria-label="Lemniscate home">
            <BrandMark size={26} className="text-gold-500 group-hover:text-gold-400 transition-colors" />
            <span className="font-display font-semibold tracking-[0.18em] uppercase text-sm text-mist-100 hidden sm:inline">Lemniscate</span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label="Primary">
            {links.map((l) => (
              <button
                key={l.view}
                onClick={() => go(l.view)}
                aria-current={view === l.view || (l.view === "analytics" && view === "history") ? "page" : undefined}
                className={cx("px-3 py-1.5 rounded-lg text-[13px] font-display tracking-wide transition-all", view === l.view || (l.view === "analytics" && view === "history") ? "text-gold-300 bg-gold-500/10 border border-gold-700/30" : "text-mist-400 hover:text-mist-100 hover:bg-ink-750/60 border border-transparent")}
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Breadcrumb — hidden on small screens */}
          <div className="hidden xl:flex items-center gap-1.5 text-xs text-mist-500 min-w-0 max-w-[200px]">
            {view === "reader" && (
              <IconBtn label="Back to library" onClick={back} className="w-7 h-7"><ArrowLeft className="w-4 h-4" /></IconBtn>
            )}
            <span className="truncate font-display uppercase tracking-[0.14em] text-[11px] text-mist-400">{crumb}</span>
            {view === "reader" && doc.data && <Badge tone="gold" className="ml-1">{doc.data.sourceType}</Badge>}
          </div>

          {/* Live jobs indicator */}
          {liveJobs.length > 0 && (
            <button
              onClick={() => setJobsOpen(true)}
              aria-label={`${liveJobs.length} background job${liveJobs.length === 1 ? "" : "s"} running`}
              className="flex items-center gap-2 h-8 px-2.5 sm:px-3 rounded-lg border border-ankaa-500/50 bg-ankaa-500/10 text-ankaa-300 hover:bg-ankaa-500/20 transition-colors text-xs font-display"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline truncate max-w-[100px]">{liveJobs[0].label ?? "Working"}…</span>
              <span className="tabular-nums">{liveJobs.length}</span>
            </button>
          )}

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 h-8 px-3 rounded-lg border border-ink-600 bg-ink-850/80 text-mist-500 hover:text-mist-200 hover:border-gold-700 transition-colors text-xs"
            aria-label="Search library"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="mr-1">Search</span>
            <kbd>⌘K</kbd>
          </button>
          <IconBtn label="Search" className="sm:hidden" onClick={() => setSearchOpen(true)}><Search className="w-4 h-4" /></IconBtn>
          <IconBtn label="Settings & profile" onClick={() => go("settings")} active={view === "settings" || view === "account"}><Settings className="w-4 h-4" /></IconBtn>
        </div>
      </header>

      {/* Mobile nav sheet */}
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Menu" side="right" width="max-w-xs">
        <nav className="p-4 flex flex-col gap-1" aria-label="Mobile">
          {links.map((l) => (
            <button key={l.view} onClick={() => { setMobileOpen(false); go(l.view); }} className={cx("flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-display transition-colors", view === l.view ? "text-gold-300 bg-gold-500/10" : "text-mist-300 hover:bg-ink-750")}>
              <l.icon className="w-4 h-4" />{l.label}
            </button>
          ))}
          <div className="gold-rule my-3" />
          <button onClick={() => { setMobileOpen(false); go("upload"); }} className="flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-display text-mist-300 hover:bg-ink-750 transition-colors"><Upload className="w-4 h-4" />Import document</button>
          <button onClick={() => { setMobileOpen(false); go("history"); }} className="flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-display text-mist-300 hover:bg-ink-750 transition-colors"><HistoryIcon className="w-4 h-4" />History</button>
          <button onClick={() => { setMobileOpen(false); go("settings"); }} className="flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-display text-mist-300 hover:bg-ink-750 transition-colors"><Settings className="w-4 h-4" />Settings</button>
          <button onClick={() => { setMobileOpen(false); go("settings", { sub: "profile" }); }} className="flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-display text-mist-300 hover:bg-ink-750 transition-colors"><UserCircle2 className="w-4 h-4" />Profile</button>
        </nav>
      </Sheet>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Sheet open={jobsOpen} onClose={() => setJobsOpen(false)} title="Background jobs" side="right" width="max-w-sm">
        <div className="p-4 space-y-3">
          {(jobsQ.data ?? []).length === 0 ? (
            <p className="text-sm text-mist-500 py-8 text-center px-4 leading-relaxed">
              Long-running AI work — Ankaa drafts, deep analyses — appears here with live steps, word counts and ETAs, even if you leave the page.
            </p>
          ) : (
            (jobsQ.data ?? []).slice(0, 12).map((j) => (
              <div key={j.id} className="hairline rounded-xl bg-ink-875 p-3.5">
                <div className="flex items-center gap-2.5 mb-1.5">
                  {j.status === "done" ? <CheckCircle2 className="w-4 h-4 text-ok-400 shrink-0" />
                    : j.status === "failed" ? <XCircle className="w-4 h-4 text-danger-400 shrink-0" />
                    : j.status === "running" ? <Loader2 className="w-4 h-4 animate-spin text-ankaa-400 shrink-0" />
                    : <Circle className="w-4 h-4 text-ink-600 shrink-0" />}
                  <p className="text-sm font-display text-mist-200 truncate flex-1">{j.label ?? j.step}</p>
                  {typeof j.words === "number" && j.words > 0 && (
                    <span className="text-[10px] font-display text-ankaa-300 tabular-nums shrink-0">{j.words.toLocaleString()} words</span>
                  )}
                </div>
                {j.status === "running" || j.status === "queued" ? (
                  <>
                    <Progress value={j.progress} className="mb-1.5" />
                    <p className="text-[11px] text-mist-500">
                      {j.step}{j.etaSec ? ` · ~${fmtClock(j.etaSec)} left` : ""}
                    </p>
                  </>
                ) : j.status === "failed" ? (
                  <p className="text-[11px] text-danger-400">{j.error}</p>
                ) : (
                  <p className="text-[11px] text-mist-600">Completed {new Date(j.updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
                )}
              </div>
            ))
          )}
          {(jobsQ.data ?? []).some((j) => j.status === "done" || j.status === "failed") && (
            <button
              onClick={async () => {
                const rows = await idbAll<AnalysisJob>("jobs");
                for (const j of rows) {
                  if (j.status === "done" || j.status === "failed") await idbDelete("jobs", j.id);
                }
                bump("jobs");
              }}
              className="w-full text-xs font-display uppercase tracking-[0.14em] text-mist-500 hover:text-danger-400 transition-colors flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-danger-500/5"
            >
              <Trash2 className="w-3 h-3" />Clear finished jobs
            </button>
          )}
          <p className="text-[10px] text-mist-600 flex items-center gap-1.5 pt-1">
            <ActivityIcon className="w-3 h-3" />Finished jobs auto-clear after 30 minutes. Jobs persist across navigation and survive reloads.
          </p>
        </div>
      </Sheet>
    </>
  );
}

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { go, openDoc } = useNav(useShallow((s) => ({ go: s.go, openDoc: s.openDoc })));
  const docs = useDocuments();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  /* Escape to close + focus trap: Tab/Shift+Tab cycles within the overlay
     so the user can't tab to elements behind the backdrop. Matches the
     behavior of the Dialog and Sheet components in ui.tsx. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) { e.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the element that opened the overlay.
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    const rows = docs.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows.slice(0, 6);
    return rows
      .map((d) => {
        let score = 0;
        if (d.title.toLowerCase().includes(needle)) score += 4;
        if (d.author.toLowerCase().includes(needle)) score += 2;
        if (d.tags.some((t) => t.toLowerCase().includes(needle))) score += 1.5;
        if (d.collection?.toLowerCase().includes(needle)) score += 1;
        return { d, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.d);
  }, [docs.data, q]);

  const actions = [
    { label: "Import a document", icon: FilePlus2, run: () => go("upload") },
    { label: "Open the writing desk", icon: PenLine, run: () => go("create") },
    { label: "Reading settings", icon: Settings, run: () => go("settings") },
  ];

  const onKey = (e: React.KeyboardEvent) => {
    const total = results.length + actions.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(total - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (sel < results.length) { openDoc(results[sel].id); onClose(); }
      else { actions[sel - results.length]?.run(); onClose(); }
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85]" role="dialog" aria-modal="true" aria-label="Search">
          <motion.div className="absolute inset-0 bg-ink-950/80 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[8vh] left-1/2 -translate-x-1/2 w-[min(94vw,620px)] panel-glass rounded-2xl overflow-hidden shadow-float"
            tabIndex={-1}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-700">
              <Search className="w-4 h-4 text-gold-400 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setSel(0); }}
                onKeyDown={onKey}
                placeholder="Search titles, authors, tags, collections…"
                className="flex-1 bg-transparent outline-none text-sm text-mist-100 placeholder:text-mist-600"
                aria-label="Search query"
              />
              <kbd>esc</kbd>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              <p className="px-3 pt-2 pb-1 text-[10px] font-display uppercase tracking-[0.16em] text-mist-600">Library</p>
              {results.length === 0 && <p className="px-3 py-3 text-sm text-mist-500">No documents match “{q}”.</p>}
              {results.map((d, i) => (
                <button key={d.id} onMouseEnter={() => setSel(i)} onClick={() => { openDoc(d.id); onClose(); }}
                  className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors", sel === i ? "bg-gold-500/10" : "hover:bg-ink-750")}>
                  <span className="w-8 h-10 rounded-md shrink-0 cover-noise relative" style={{ background: d.coverGradient }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm text-mist-100 truncate">{d.title}</span>
                    <span className="block text-xs text-mist-500 truncate">{d.author} · {d.sourceType.toUpperCase()} · {Math.round(d.readingProgress)}%</span>
                  </span>
                </button>
              ))}
              <p className="px-3 pt-3 pb-1 text-[10px] font-display uppercase tracking-[0.16em] text-mist-600">Actions</p>
              {actions.map((a, i) => (
                <button key={a.label} onMouseEnter={() => setSel(results.length + i)} onClick={() => { a.run(); onClose(); }}
                  className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors", sel === results.length + i ? "bg-gold-500/10 text-gold-300" : "text-mist-300 hover:bg-ink-750")}>
                  <a.icon className="w-4 h-4" />{a.label}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
