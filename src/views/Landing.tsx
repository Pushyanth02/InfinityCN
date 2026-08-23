"use client";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Upload,
  BookOpen,
  PenLine,
  MessageCircleHeart,
  ScrollText,
  PenTool,
  Focus,
  Type,
  MessageSquare,
  Clapperboard,
  ArrowRight,
  Library,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Highlighter,
  Bookmark,
  ScanText,
  Database,
  ShieldCheck,
  Cpu,
  Menu as MenuIcon,
  X,
  ChevronRight,
  Quote,
  Sparkles,
  Server,
  ShieldAlert,
  ExternalLink,
  ArrowUpRight,
  UploadCloud,
} from "lucide-react";
import { useNav, usePrefs } from "../lib/store";
import { BrandMark, GlowLayer, ParticleField } from "../components/brand";
import { Button, Reveal, Segmented, Badge, Dialog } from "../components/ui";
import { cx } from "../lib/utils";

/* ---------- magnetic CTA ---------- */
function Magnetic({
  children,
  strength = 0.16,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  return (
    <motion.div
      ref={ref}
      className="inline-block"
      onMouseMove={(e) => {
        if (reduce || motionOff || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        ref.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }}
      onMouseLeave={() => {
        if (ref.current) ref.current.style.transform = "translate(0,0)";
      }}
      style={{
        transition: "transform 0.35s cubic-bezier(0.22,1,0.36,1)",
        willChange: "transform",
      }}
    >
      {children}
    </motion.div>
  );
}

const scrollTo = (id: string) =>
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });

const FORMATS = ["PDF", "EPUB", "DOCX", "PPTX", "Markdown", "TXT", "HTML"];

const RAW_WALL = `The dungeon breathed below the city like a sleeping beast, its exhale rising through cracked flagstones in the form of dust and old magic. Most who walked above never felt it — but those who descended, those who answered the call of the deep, they knew. The stone remembered every footstep, every torch, every soul that had dared to go lower. Pushyanth stood at the threshold of the ninth level, where the air turned from cold to alive. The necromancer's mark pulsed on his wrist — a spiral of bone-white light that had appeared the night the dungeon had first called to him. It was not a curse. It was an invitation. Below, the dead walked. Not as shambling corpses, but as guardians, keepers of secrets that the living world had forgotten.`;

/* Hero book — a single elegant "cover" for the featured story.
   Clicking the cover opens a confirmation dialog before redirecting to
   the author's external page — users are told they are leaving the app. */
const HERO_BOOK = {
  title: "Dungeoncore Necromancer",
  author: "Pushyanth",
  url: "https://pushyanth02.github.io/Dungeoncore-Necromancer/",
};

type BotAccent = "gold" | "ouro" | "ankaa" | "ok";
const BOT_ACCENT_LINE: Record<BotAccent, string> = {
  gold: "linear-gradient(90deg, transparent, #d9ad52 30%, #f0d99a 50%, #d9ad52 70%, transparent)",
  ouro: "linear-gradient(90deg, transparent, #6d84e8 30%, #b4c1f7 50%, #6d84e8 70%, transparent)",
  ankaa:
    "linear-gradient(90deg, transparent, #db814c 30%, #f2b893 50%, #db814c 70%, transparent)",
  ok: "linear-gradient(90deg, transparent, #63b478 30%, #8fce9d 50%, #63b478 70%, transparent)",
};
const BOT_GLOW: Record<BotAccent, string> = {
  gold: "radial-gradient(circle at 50% 0%, rgba(217,173,82,0.10), transparent 70%)",
  ouro: "radial-gradient(circle at 50% 0%, rgba(109,132,232,0.10), transparent 70%)",
  ankaa:
    "radial-gradient(circle at 50% 0%, rgba(219,129,76,0.10), transparent 70%)",
  ok: "radial-gradient(circle at 50% 0%, rgba(99,180,120,0.10), transparent 70%)",
};

const BOTS = [
  {
    icon: MessageCircleHeart,
    name: "Luma",
    role: "Reading companion",
    accent: "gold" as BotAccent,
    tone: "text-gold-400 border-gold-700/50 bg-gold-500/10",
    line: "A warm, fast voice in the margin. Ask about a passage, a word, a character — answers arrive grounded in the chapter you’re on.",
    tags: ["Streams answers", "Grounded in text", "Vocabulary & scenes"],
    honest:
      "Meridian selects the best free model; Anchor takes over instantly if the key is missing or the network is down.",
  },
  {
    icon: ScrollText,
    name: "Ouro",
    role: "Study companion",
    accent: "ouro" as BotAccent,
    tone: "text-ouro-400 border-ouro-500/50 bg-ouro-500/10",
    line: "A seminar tutor, not a summary bot. Ask for exactly what you need — a summary, a quiz, a study guide, themes, vocabulary or essay prompts.",
    tags: ["Sourced quizzes", "Study guides", "Whole-text vs. chapter"],
    honest:
      "Meridian picks the ideal free model; Anchor delivers grounded study sets offline.",
  },
  {
    icon: PenTool,
    name: "Ankaa",
    role: "Long-form writer",
    accent: "ankaa" as BotAccent,
    tone: "text-ankaa-400 border-ankaa-500/50 bg-ankaa-500/10",
    line: "Outlines first, then writes section by section with a live word count — and can continue the very book you’re reading as a new chapter.",
    tags: ["~2,500-word drafts", "Continues your book", "Background jobs"],
    honest:
      "Meridian routes to the best free creative model; Anchor writes ~1,800 words on-device if the network is down.",
  },
];

/* ── Meridian & Anchor infrastructure cards ── */
const INFRA = [
  {
    icon: Sparkles,
    name: "Meridian",
    role: "AI model orchestrator",
    accent: "gold" as BotAccent,
    tone: "text-gold-400 border-gold-700/50 bg-gold-500/10",
    line: "Selects and coordinates the best available free models from OpenRouter without exposing implementation complexity.",
    tags: ["Free models only", "Auto-ranked", "Transparent fallback"],
    honest:
      "Meridian fetches the live OpenRouter catalog, filters to free models only, and ranks them by task suitability — speed for Luma, analysis for Ouro, long-context creativity for Ankaa. You never see the model name; you just get the best output.",
  },
  {
    icon: ShieldAlert,
    name: "Anchor",
    role: "Offline continuity engine",
    accent: "ok" as BotAccent,
    tone: "text-ok-400 border-ok-500/50 bg-ok-500/10",
    line: "Keeps the reading room useful on-device when AI or the network is unavailable.",
    tags: ["100% offline", "Extractive NLP", "Zero downtime"],
    honest:
      "Anchor runs grounded extractive analysis — summaries, quizzes, scene dramatization and long-form drafts — entirely in your browser via IndexedDB. No key, no network, no problem.",
  },
];

const FEATURES = [
  {
    icon: ScanText,
    title: "Real document intake",
    body: "PDF, EPUB, DOCX, PPTX, Markdown, TXT and HTML are parsed on-device into clean, chapter-aware text — boilerplate stripped, dialogue kept on its own lines, headings numbered in Arabic, Roman or 第X章.",
    span: "lg:col-span-2",
  },
  {
    icon: Clapperboard,
    title: "Scene view",
    body: "Cinematize a chapter into original scene cards — mood, cast and dramatised prose that enlarges the source rather than compressing it.",
  },
  {
    icon: Focus,
    title: "Focus mode",
    body: "Dims the surrounding paragraphs into an ambient concentration mode. Nothing is hidden; everything stays readable.",
  },
  {
    icon: Type,
    title: "Book-grade typography",
    body: "Literata, Garamond, Spectral, Source Serif, Georgia, Bookerly, Baskerville and Palatino — with size, line-height, tracking and measure you control.",
  },
  {
    icon: Highlighter,
    title: "Annotations",
    body: "Select any passage, attach a note and a colour. Marks persist and stay legible without harming the page.",
  },
  {
    icon: Bookmark,
    title: "Bookmarks & resume",
    body: "Bookmark a passage with a label; progress saves as you read and the reader returns you exactly where you left off.",
  },
  {
    icon: MessageSquare,
    title: "Ask the text",
    body: "Luma retrieves from the active chapter and its neighbours — it never blindly sends the whole book to a model.",
  },
  {
    icon: PenLine,
    title: "Write in the margins",
    body: "Continue the story, draft an alternate ending or world lore — then weave the result back into the book as its next chapter.",
    span: "lg:col-span-2",
  },
];

const PIPELINE = [
  {
    n: "01",
    title: "Import",
    body: "Drop a file. Lemniscate validates it by content — not just by name — and enforces size limits.",
  },
  {
    n: "02",
    title: "Structure",
    body: "Chapters are detected from headings and typography, never arbitrary splits; an optional AI pass refines boundaries and dialogue.",
  },
  {
    n: "03",
    title: "Read",
    body: "A calm, measure-controlled page with focus mode, scenes, annotations and three companions at the edge.",
  },
  {
    n: "04",
    title: "Create",
    body: "Ankaa drafts long-form from your book’s context and can append the result as the next chapter.",
  },
];

const SECTION_IDS = ["bots", "features", "demo"] as const;
type SectionId = (typeof SECTION_IDS)[number];

/* ---------- hero book (single elegant cover) ---------- */
function HeroBook() {
  const reduce = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  const animate = reduce || motionOff ? undefined : { y: [0, -10, 0] };
  const transition =
    reduce || motionOff
      ? undefined
      : { duration: 7, repeat: Infinity, ease: "easeInOut" as const };
  const [redirectOpen, setRedirectOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setRedirectOpen(true)}
        initial={false}
        animate={animate}
        transition={transition}
        aria-label={`Open “${HERO_BOOK.title}” by ${HERO_BOOK.author} on the web`}
        className="block w-full max-w-sm mx-auto text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-4 focus-visible:ring-offset-ink-950 rounded-xl"
      >
        <div className="relative">
          {/* ambient glow behind the book */}
          <div
            className="absolute -inset-10 opacity-70 blur-3xl pointer-events-none group-hover:opacity-90 transition-opacity duration-500"
            style={{
              background:
                "radial-gradient(circle at 50% 40%, rgba(217,173,82,0.28), rgba(109,132,232,0.10) 45%, transparent 70%)",
            }}
            aria-hidden
          />

          {/* the book */}
          <div className="relative panel rounded-xl overflow-hidden hover-lift shadow-float group-hover:shadow-glow-gold transition-shadow duration-500">
            {/* spine */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to right, rgba(148,109,46,0.55), rgba(148,109,46,0.15) 60%, transparent)",
              }}
              aria-hidden
            />

            {/* cover header */}
            <div
              className="cover-noise relative px-7 sm:px-9 pt-12 sm:pt-16 pb-10 sm:pb-12 text-center"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 0%, #211e2a 0%, #15131b 65%, #0d0c10 100%)",
              }}
            >
              <BrandMark
                size={88}
                animated
                className="text-gold-500 mx-auto mb-6 block"
                strokeWidth={2.5}
              />
              <h3 className="font-garamond italic text-2xl sm:text-3xl text-mist-100 leading-tight">
                {HERO_BOOK.title}
              </h3>
              <p className="text-[10px] font-display tracking-[0.22em] uppercase text-mist-500 mt-2">
                {HERO_BOOK.author}
              </p>

              {/* cover ornaments */}
              <div
                className="mt-5 flex items-center justify-center gap-2"
                aria-hidden
              >
                <span className="w-6 h-px bg-gold-700/50" />
                <span className="w-1 h-1 rounded-full bg-gold-600/70" />
                <span className="w-6 h-px bg-gold-700/50" />
              </div>
            </div>

            {/* hover hint bar — tells users the cover is clickable */}
            <div className="px-7 sm:px-9 py-3.5 flex items-center justify-center gap-2 bg-ink-900/80 border-t border-ink-700/50 text-gold-400/80 group-hover:text-gold-300 group-hover:bg-ink-850 transition-colors duration-300">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="text-[10px] font-display uppercase tracking-[0.2em]">
                Read on the web
              </span>
              <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </div>
      </motion.button>

      {/* redirect confirmation dialog */}
      <Dialog
        open={redirectOpen}
        onClose={() => setRedirectOpen(false)}
        title="Leaving the reading room"
      >
        <div className="space-y-4">
          <p className="text-sm text-mist-300 leading-relaxed">
            You're about to open{" "}
            <span className="font-display text-gold-300">
              “{HERO_BOOK.title}”
            </span>{" "}
            by {HERO_BOOK.author} on an external website. A new browser tab will
            open — Lemniscate stays right here when you come back.
          </p>
          <div className="rounded-lg border border-ink-700 bg-ink-850 px-4 py-3 flex items-center gap-2.5">
            <ExternalLink className="w-4 h-4 text-gold-500 shrink-0" />
            <code className="text-[11px] text-mist-400 font-mono break-all">
              {HERO_BOOK.url}
            </code>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-1">
            <Button
              variant="ghost"
              onClick={() => setRedirectOpen(false)}
              className="w-full sm:w-auto"
            >
              Stay here
            </Button>
            {/* A real anchor (not window.open) so browsers never block it as a
                popup and middle-click / Ctrl+click keep working natively. */}
            <a
              href={HERO_BOOK.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setRedirectOpen(false)}
              className="inline-flex items-center justify-center gap-2 rounded-lg font-display tracking-wide transition-all duration-200 select-none whitespace-nowrap press w-full sm:w-auto text-sm px-4 py-2.5 bg-gold-500 text-(--acc-ink) border border-gold-400/50 hover:bg-gold-400 active:bg-gold-600 shadow-[0_4px_20px_-6px_var(--acc-glow),0_1px_0_0_rgb(255_255_255/0.2)_inset] font-semibold"
            >
              <ExternalLink className="w-4 h-4" />
              Open in a new tab
            </a>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export default function Landing() {
  const go = useNav((s) => s.go);
  const setPendingFile = useNav((s) => s.setPendingFile);
  const [demoMode, setDemoMode] = useState<"raw" | "scene">("raw");
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* sticky nav glass-on-scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* scroll-spy: highlight nav link for the section currently in view */
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection((prev) => (prev === id ? prev : id));
            }
          }
        },
        { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const navLinks: [string, SectionId, () => void][] = [
    ["Companions", "bots", () => scrollTo("bots")],
    ["Features", "features", () => scrollTo("features")],
    ["Demo", "demo", () => scrollTo("demo")],
  ];

  /* Hand a selected file to the Upload view for immediate processing. */
  const handoffFile = useCallback(
    (file: File) => {
      setPendingFile(file);
      go("upload");
    },
    [setPendingFile, go],
  );

  return (
    <div className="min-h-screen bg-ink-950 text-mist-200 relative overflow-x-clip font-body">
      {/* ---------- nav (sticky, glass-on-scroll) ---------- */}
      <nav
        className={cx(
          "fixed top-0 inset-x-0 z-40 transition-all duration-300",
          scrolled
            ? "panel-glass border-b border-ink-700/60 shadow-float"
            : "bg-transparent border-b border-transparent",
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3 sm:gap-6">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="Lemniscate — back to top"
          >
            <BrandMark size={28} animated className="text-gold-500" />
            <span className="font-display font-semibold tracking-[0.22em] uppercase text-sm text-mist-100">
              Lemniscate
            </span>
          </button>

          <div className="hidden md:flex items-center gap-1 ml-2">
            {navLinks.map(([label, id, run]) => {
              const active = activeSection === id;
              return (
                <button
                  key={label}
                  onClick={run}
                  aria-current={active ? "true" : undefined}
                  className={cx(
                    "relative px-3 py-2 text-[13px] font-display tracking-wide transition-colors min-h-10 inline-flex items-center",
                    active
                      ? "text-gold-300"
                      : "text-mist-400 hover:text-gold-300",
                  )}
                >
                  {label}
                  <span
                    className={cx(
                      "absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-gold-400 transition-all duration-300",
                      active ? "w-5 opacity-100" : "w-0 opacity-0",
                    )}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => go("library")}
            className="hidden sm:inline-flex"
          >
            <Library className="w-3.5 h-3.5" />
            Library
          </Button>
          <Magnetic>
            <Button
              variant="gold"
              size="sm"
              onClick={() => go("dashboard")}
              className="min-h-10"
            >
              Enter the room
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Magnetic>

          {/* mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-ink-600 text-mist-300 hover:text-gold-300 hover:border-gold-700/60 transition-colors shrink-0"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <MenuIcon className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden panel-glass border-t border-ink-700/60 overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-3 flex flex-col">
                {navLinks.map(([label, id, run]) => {
                  const active = activeSection === id;
                  return (
                    <button
                      key={label}
                      onClick={() => {
                        run();
                        setMobileMenuOpen(false);
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "text-left px-3 py-3 text-sm font-display tracking-wide transition-colors border-b border-ink-700/40 last:border-0 min-h-11 inline-flex items-center gap-3",
                        active
                          ? "text-gold-300"
                          : "text-mist-300 hover:text-gold-300",
                      )}
                    >
                      <span
                        className={cx(
                          "w-1 h-4 rounded-full transition-colors",
                          active ? "bg-gold-400" : "bg-ink-600",
                        )}
                      />
                      {label}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    go("library");
                    setMobileMenuOpen(false);
                  }}
                  className="text-left px-3 py-3 text-sm font-display tracking-wide text-mist-300 hover:text-gold-300 transition-colors min-h-11 inline-flex items-center gap-3"
                >
                  <span className="w-1 h-4 rounded-full bg-ink-600" />
                  Library
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ---------- hero ---------- */}
      <header className="relative pt-28 sm:pt-32 lg:pt-40 pb-16 sm:pb-20 lg:pb-28 px-4 sm:px-6 lg:px-8">
        <GlowLayer variant="landing" />
        <ParticleField density={55} />

        <div className="max-w-6xl mx-auto relative grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-16 items-center">
          {/* left: copy */}
          <div className="text-center lg:text-left">
            <Reveal>
              <p className="inline-flex items-center justify-center gap-2.5 text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-5 sm:mb-6">
                <span className="w-8 h-px bg-gold-600 inline-block" />
                A local-first reading room
                <span className="w-8 h-px bg-gold-600 inline-block lg:hidden" />
              </p>
            </Reveal>
            <Reveal delay={0.04}>
              <h1 className="font-display font-semibold text-4xl sm:text-5xl lg:text-6xl leading-[1.04] text-mist-100 tracking-tight">
                Open the
                <br />
                <span className="font-garamond italic font-normal text-gradient-gold">
                  reading room.
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 sm:mt-7 max-w-xl mx-auto lg:mx-0 text-[15px] sm:text-base leading-relaxed text-mist-400">
                Lemniscate turns books, papers and documents into living,
                interactive experiences — chapter-aware on the page, accompanied
                in the margins, and written back into by hand. Meridian
                orchestrates the best free OpenRouter models; Anchor keeps
                everything working offline.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <div className="mt-8 sm:mt-9 flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-4">
                <Magnetic>
                  <Button
                    variant="gold"
                    size="lg"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-11"
                  >
                    <Upload className="w-4 h-4" />
                    Bring a document
                  </Button>
                </Magnetic>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => go("dashboard")}
                  className="min-h-11"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Open the dashboard
                </Button>
                <button
                  onClick={() => go("create")}
                  className="text-sm font-display text-gold-400 hover:text-gold-300 inline-flex items-center gap-1.5 transition-colors min-h-11 px-2"
                >
                  <PenLine className="w-4 h-4" />
                  Create a story
                </button>
              </div>
            </Reveal>
            <Reveal delay={0.22}>
              <div className="mt-9 sm:mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 sm:gap-x-6 gap-y-2 text-[11px] font-display uppercase tracking-[0.18em] text-mist-600">
                <span className="inline-flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-gold-600" />
                  BYOK OpenRouter
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-gold-600" />
                  Anchor offline
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-gold-600" />7 formats ·
                  Meridian
                </span>
              </div>
            </Reveal>
          </div>

          {/* right: single elegant hero book */}
          <Reveal delay={0.12} className="relative">
            <HeroBook />
          </Reveal>
        </div>
      </header>

      {/* ---------- format ledger ---------- */}
      <section className="border-y border-ink-700/60 bg-ink-900/60 py-6 sm:py-8 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-x-6 sm:gap-x-10 gap-y-3 justify-center">
          <span className="text-[10px] font-display uppercase tracking-[0.28em] text-mist-600">
            Reads
          </span>
          {FORMATS.map((f) => (
            <span
              key={f}
              className="font-display text-sm tracking-[0.2em] text-mist-500 hover:text-gold-300 transition-colors cursor-default"
            >
              {f}
            </span>
          ))}
          <span className="hidden md:inline text-[10px] font-display uppercase tracking-[0.28em] text-mist-600 ml-auto">
            into one calm page
          </span>
        </div>
      </section>

      {/* ---------- companions ---------- */}
      <section
        id="bots"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28 scroll-mt-20"
      >
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-14">
            <div>
              <p className="text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-3">
                The companions
              </p>
              <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 leading-tight">
                Three voices,
                <br />
                one room.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-mist-500 leading-relaxed">
              Each keeps to its craft. Meridian routes every request to the best
              free model on OpenRouter, and Anchor takes over instantly when AI
              is unavailable — so the room is never empty.
            </p>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-3 gap-4 sm:gap-5">
          {BOTS.map((b, i) => (
            <Reveal key={b.name} delay={i * 0.08} className="h-full">
              <div
                className={cx(
                  "panel rounded-xl h-full flex flex-col overflow-hidden hover-lift hover:border-gold-700/40 group relative",
                )}
              >
                {/* accent glow overlay (sits behind content) */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: BOT_GLOW[b.accent] }}
                  aria-hidden
                />

                {/* accent strip */}
                <div
                  className="relative h-1 w-full"
                  style={{ background: BOT_ACCENT_LINE[b.accent] }}
                  aria-hidden
                />

                <div className="relative p-6 sm:p-7 flex-1 flex flex-col">
                  <div
                    className={cx(
                      "w-12 h-12 rounded-lg border flex items-center justify-center shrink-0 mb-5 transition-transform group-hover:scale-105",
                      b.tone,
                    )}
                  >
                    <b.icon className="w-6 h-6" />
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
                    <h3 className="font-display text-xl sm:text-2xl text-mist-100">
                      {b.name}
                    </h3>
                    <span className="text-[10px] font-display uppercase tracking-[0.22em] text-mist-500">
                      {b.role}
                    </span>
                  </div>
                  <p className="text-[14px] leading-relaxed text-mist-400 mb-4">
                    {b.line}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {b.tags.map((t) => (
                      <Badge key={t} tone={b.accent}>
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto pt-4 border-t border-ink-700/40">
                    <p className="text-[11px] text-mist-600 leading-relaxed italic flex items-start gap-2">
                      <Quote className="w-3 h-3 text-gold-700/70 mt-0.5 shrink-0" />
                      <span>{b.honest}</span>
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- pipeline ---------- */}
      <section className="border-y border-ink-700/60 bg-ink-900/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal>
            <p className="text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-3">
              The loop
            </p>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 mb-10 sm:mb-14 leading-tight">
              Import → structure → read → create.
            </h2>
          </Reveal>

          <div className="relative">
            {/* desktop connector line, sits at the y-center of the step badges */}
            <div
              className="hidden lg:block absolute top-12 left-0 right-0 h-px pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(148,109,46,0.45) 12%, rgba(148,109,46,0.45) 88%, transparent)",
              }}
              aria-hidden
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {PIPELINE.map((p, i) => (
                <Reveal key={p.n} delay={i * 0.07} className="relative h-full">
                  <div className="panel rounded-xl p-5 sm:p-6 lg:p-7 h-full hover-lift hover:border-gold-700/40 group relative overflow-hidden">
                    <span
                      className="absolute -top-3 -right-2 font-garamond italic text-7xl sm:text-8xl text-gold-700/10 group-hover:text-gold-700/20 transition-colors pointer-events-none select-none"
                      aria-hidden
                    >
                      {p.n}
                    </span>
                    <div className="relative">
                      <span className="relative z-10 inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gold-700/40 bg-ink-850 text-gold-400 font-display text-xs tracking-wide">
                        {p.n}
                      </span>
                      <h3 className="mt-4 font-display text-lg text-mist-100">
                        {p.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-mist-500">
                        {p.body}
                      </p>
                    </div>
                  </div>

                  {/* connector arrow between cards (lg+ only) */}
                  {i < PIPELINE.length - 1 && (
                    <div
                      className="hidden lg:flex absolute top-12 -right-6 -translate-y-1/2 z-20 items-center justify-center w-6 h-6 rounded-full bg-ink-950 border border-gold-700/40 shadow-float"
                      aria-hidden
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-gold-500" />
                    </div>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- infrastructure: Meridian + Anchor ---------- */}
      <section className="border-y border-ink-700/60 bg-ink-900/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24">
          <Reveal>
            <p className="text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-3">
              The infrastructure
            </p>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 mb-10 sm:mb-14 leading-tight">
              Meridian curates.
              <br />
              Anchor never sleeps.
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
            {INFRA.map((b, i) => (
              <Reveal key={b.name} delay={i * 0.1} className="h-full">
                <div
                  className={cx(
                    "panel rounded-xl h-full flex flex-col overflow-hidden hover-lift hover:border-gold-700/40 group relative",
                  )}
                >
                  {/* accent top strip */}
                  <div
                    className="relative h-1 w-full"
                    style={{ background: BOT_ACCENT_LINE[b.accent] }}
                    aria-hidden
                  />
                  {/* glow */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: BOT_GLOW[b.accent] }}
                    aria-hidden
                  />
                  <div className="relative p-5 sm:p-6 lg:p-7 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={cx(
                          "w-12 h-12 rounded-xl border flex items-center justify-center shrink-0",
                          b.tone,
                        )}
                      >
                        <b.icon className="w-6 h-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-xl text-mist-100">
                          {b.name}
                        </h3>
                        <p className="text-[11px] font-display uppercase tracking-[0.2em] text-mist-500">
                          {b.role}
                        </p>
                      </div>
                    </div>
                    <p className="text-[14px] sm:text-[15px] leading-relaxed text-mist-400 mb-4">
                      {b.line}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {b.tags.map((t) => (
                        <Badge key={t} tone="muted">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-mist-600 leading-relaxed mt-auto italic">
                      {b.honest}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- features ---------- */}
      <section
        id="features"
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28 scroll-mt-20"
      >
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap mb-10 sm:mb-14">
            <div>
              <p className="text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-3">
                The craft
              </p>
              <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 leading-tight">
                Built for the long
                <br />
                sit-down.
              </h2>
            </div>
            <Button
              variant="outline"
              onClick={() => go("settings")}
              className="min-h-11"
            >
              <Settings className="w-4 h-4" />
              Tune it in Settings
            </Button>
          </div>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f, i) => (
            <Reveal
              key={f.title}
              delay={(i % 3) * 0.07}
              className={cx(f.span ?? "", "h-full")}
            >
              <div className="panel rounded-xl p-5 sm:p-6 h-full hover-lift hover:border-gold-700/50 group flex flex-col">
                <div className="w-10 h-10 rounded-lg border border-ink-600 bg-ink-800 flex items-center justify-center mb-4 group-hover:border-gold-700/50 group-hover:bg-gold-500/10 transition-colors">
                  <f.icon className="w-5 h-5 text-gold-500 group-hover:text-gold-300 transition-colors" />
                </div>
                <h3 className="font-display text-[16px] sm:text-[17px] text-mist-100">
                  {f.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-mist-500">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- demo ---------- */}
      <section
        id="demo"
        className="border-t border-ink-700/60 bg-ink-900/60 scroll-mt-20"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28">
          <Reveal>
            <div className="flex items-end justify-between gap-6 flex-wrap mb-8 sm:mb-10">
              <div>
                <p className="text-[11px] font-display uppercase tracking-[0.3em] text-gold-400 mb-3">
                  The transformation
                </p>
                <h2 className="font-display font-semibold text-3xl sm:text-4xl lg:text-5xl text-mist-100 leading-tight">
                  From a wall of text
                  <br />
                  to a living scene.
                </h2>
              </div>
              <Segmented
                ariaLabel="Demo mode"
                value={demoMode}
                onChange={(v) => setDemoMode(v)}
                options={[
                  { value: "raw", label: "The raw page" },
                  { value: "scene", label: "The scene" },
                ]}
              />
            </div>
          </Reveal>

          <Reveal>
            <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 lg:gap-6 items-start">
              {/* raw page */}
              <div
                className={cx(
                  "panel rounded-xl p-6 sm:p-7 transition-all duration-700 ease-out",
                  demoMode === "raw"
                    ? "opacity-100 scale-100 ring-1 ring-gold-700/30 shadow-glow-gold"
                    : "opacity-50 scale-[0.985]",
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-display uppercase tracking-[0.24em] text-mist-600">
                    As imported · {RAW_WALL.split(" ").length} words
                  </p>
                  {demoMode === "raw" && (
                    <span className="text-[10px] font-display uppercase tracking-[0.2em] text-gold-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse-soft" />
                      Viewing
                    </span>
                  )}
                </div>
                <p className="font-literata text-[14px] sm:text-[15px] leading-relaxed text-mist-400 text-justify">
                  {RAW_WALL}
                </p>
              </div>

              {/* transformation indicator (desktop) */}
              <div className="hidden lg:flex flex-col items-center justify-center gap-3 pt-16">
                <span className="text-[9px] font-display uppercase tracking-[0.24em] text-mist-600">
                  Becomes
                </span>
                <div className="w-9 h-9 rounded-full border border-gold-700/40 bg-ink-850 flex items-center justify-center shadow-float">
                  <ArrowRight className="w-4 h-4 text-gold-500" />
                </div>
                <div
                  className="w-px h-12 bg-linear-to-b from-gold-700/40 to-transparent"
                  aria-hidden
                />
              </div>

              {/* scene */}
              <div
                className={cx(
                  "transition-all duration-700 ease-out",
                  demoMode === "scene"
                    ? "opacity-100 scale-100 translate-y-0"
                    : "opacity-50 scale-[0.985] translate-y-1",
                )}
              >
                <div className="panel rounded-xl overflow-hidden">
                  <div
                    className="h-1.5 w-full"
                    style={{
                      background:
                        "linear-gradient(90deg,#d2a84e,#6d84e8 55%,transparent)",
                    }}
                    aria-hidden
                  />
                  <div className="p-6 sm:p-7">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-display uppercase tracking-[0.22em] text-mist-500">
                        INT. — DUSK
                      </p>
                      {demoMode === "scene" && (
                        <span className="text-[10px] font-display uppercase tracking-[0.2em] text-gold-400 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-gold-400 animate-pulse-soft" />
                          Viewing
                        </span>
                      )}
                    </div>
                    <h3 className="font-garamond italic text-2xl sm:text-3xl text-mist-100">
                      “Dungeoncore Necromancer”
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-mist-500 font-display tracking-wide">
                      hushed anticipation · deep · dungeon
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {["Pushyanth", "The Warden", "The Archivist"].map((c) => (
                        <span
                          key={c}
                          className="text-xs font-display px-2.5 py-1.5 rounded-md border border-ink-600 bg-ink-800 text-mist-200"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <p className="mt-5 text-[14px] sm:text-[15px] leading-relaxed text-mist-300 font-literata">
                      The dungeon breathes below the city like a sleeping beast.
                      Pushyanth descends through the ninth level, where the air
                      turns from cold to alive, and the dead walk not as corpses
                      but as guardians. The necromancer's mark pulses on his
                      wrist — bone-white light, a spiral that is not a curse but
                      an invitation to command what the living world has
                      forgotten.
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-mist-600 leading-relaxed flex items-center gap-2">
                  <Clapperboard className="w-3.5 h-3.5 text-gold-500 shrink-0" />
                  Ankaa dramatises and elevates the prose — it never compresses
                  it.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-12 sm:mt-16 text-center">
              {/* Compact dropzone — direct intake without leaving the landing page */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handoffFile(f);
                }}
                className={cx(
                  "max-w-md mx-auto rounded-xl border-2 border-dashed transition-all duration-300 p-6 sm:p-8 cursor-pointer",
                  dragOver
                    ? "border-gold-500 bg-gold-500/10 shadow-glow-gold scale-[1.02]"
                    : "border-ink-600 hover:border-gold-700 hover:bg-ink-850/60",
                )}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Drop a document here or click to browse"
              >
                <UploadCloud
                  className={cx(
                    "w-8 h-8 mx-auto mb-3 transition-colors",
                    dragOver ? "text-gold-400" : "text-mist-500",
                  )}
                />
                <p className="text-sm font-display text-mist-200 mb-1">
                  {dragOver
                    ? "Drop to open it in the reading room"
                    : "Drop a document here"}
                </p>
                <p className="text-[11px] text-mist-600">
                  PDF · EPUB · DOCX · PPTX · Markdown · TXT · HTML
                </p>
              </div>
              <Magnetic>
                <Button
                  variant="gold"
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-11 mt-5"
                >
                  <BookOpen className="w-4 h-4" />
                  Bring your own document
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Magnetic>
              <p className="mt-3 text-[11px] font-display uppercase tracking-[0.2em] text-mist-600">
                No account. No upload to a server. Just your reading room.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-ink-700/60 bg-ink-950 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 sm:gap-10">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <BrandMark size={26} className="text-gold-500" />
                <span className="font-display font-semibold tracking-[0.22em] uppercase text-sm text-mist-100">
                  Lemniscate
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-mist-500 max-w-xs">
                A local-first reading room where documents become living,
                interactive experiences.
              </p>
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                <Badge tone="gold">
                  <Database className="w-3 h-3" />
                  Local-first
                </Badge>
                <Badge tone="muted">No account</Badge>
              </div>
            </div>

            {(
              [
                [
                  "Product",
                  [
                    ["Library", () => go("library")],
                    ["Dashboard", () => go("dashboard")],
                    ["Import", () => go("upload")],
                  ],
                ],
                [
                  "Create",
                  [
                    ["Writing desk", () => go("create")],
                    ["Insights", () => go("analytics")],
                    ["History", () => go("history")],
                  ],
                ],
                [
                  "About",
                  [
                    ["Settings", () => go("settings")],
                    ["Profile", () => go("settings", { sub: "profile" })],
                    ["Help", () => go("settings", { sub: "about" })],
                  ],
                ],
              ] as [string, [string, () => void][]][]
            ).map(([head, links]) => (
              <div key={head}>
                <p className="text-[10px] font-display uppercase tracking-[0.26em] text-mist-600 mb-4">
                  {head}
                </p>
                <ul className="space-y-2.5">
                  {links.map(([label, run]) => (
                    <li key={label}>
                      <button
                        onClick={run}
                        className="text-[13px] text-mist-400 hover:text-gold-300 transition-colors inline-flex items-center gap-1.5 min-h-7 group"
                      >
                        <span
                          className="w-0 group-hover:w-3 h-px bg-gold-500 transition-all duration-200"
                          aria-hidden
                        />
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-ink-700/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[11px] text-mist-600 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              Documentation lives in Settings → About.
            </p>
            <p className="text-[11px] text-mist-600 font-display tracking-wide">
              ∞ Read · annotate · create · return.
            </p>
          </div>
        </div>
      </footer>

      {/* Hidden file input — triggered by the hero + demo CTAs and the dropzone.
          On selection, the file is handed off to the Upload view for processing. */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.docx,.pptx,.ppt,.md,.markdown,.txt,.text,.html,.htm"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handoffFile(f);
          e.target.value = ""; // reset so the same file can be re-selected
        }}
      />
    </div>
  );
}
