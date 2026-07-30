"use client";

import * as React from "react";
import {
  ArrowRight,
  Film,
  Focus,
  MessageSquareQuote,
  Sparkles,
  Upload,
  BookOpen,
  BookHeart,
  GraduationCap,
} from "lucide-react";
import { useNav } from "@/lib/nav-store";
import { FanLemniscateMark } from "@/components/ui/fan-logo";
import { ShaderBackground } from "@/components/ui/shader-background";
import { LumaMark, OuroMark, AnkaaMark } from "@/components/ui/bot-logos";
import { cn } from "@/lib/utils";
import { Reveal, ScrollProgress } from "@/components/ui/reveal";
import { ParticleField } from "@/components/ui/particle-field";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { MagneticButton } from "@/components/ui/magnetic-button";
import type { ViewName } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/*  Types & helpers                                                           */
/* -------------------------------------------------------------------------- */

type GoFn = (
  view: ViewName,
  opts?: { documentId?: string; returnTo?: ViewName },
) => void;

type CSSVars = React.CSSProperties &
  Partial<Record<`--${string}`, string | number | undefined>>;

function scrollToAnchor(e: React.MouseEvent, href: string) {
  e.preventDefault();
  if (typeof document === "undefined") return;
  // Guard against invalid selectors: "#", empty strings, or malformed hrefs.
  // querySelector throws a SyntaxError for "#" alone.
  if (!href || href === "#" || href.length < 2) return;
  try {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    // Invalid selector — silently ignore rather than crash.
  }
}

/* -------------------------------------------------------------------------- */
/*  Content — all accurate, no false claims                                   */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { label: "Bots", href: "#bots" },
  { label: "Features", href: "#features" },
  { label: "Demo", href: "#demo" },
] as const;

const FILE_TYPES = ["PDF", "EPUB", "DOCX", "MD", "TXT", "HTML"] as const;

const FEATURES = [
  {
    icon: Upload,
    title: "Upload anything",
    desc: "PDF, EPUB, DOCX, Markdown, TXT, HTML. Parsed into chapters on the server and stored in a persistent library.",
  },
  {
    icon: BookHeart,
    title: "Three AI companions",
    desc: "Luma for fast chat, Ouro for literary study, and Ankaa for long-form creative writing — all grounded in what you're reading.",
  },
  {
    icon: GraduationCap,
    title: "Study tools",
    desc: "Ouro builds study guides, flashcards, and quizzes from any passage, grounded in the text.",
  },
  {
    icon: Sparkles,
    title: "Long-form writing",
    desc: "Ankaa writes full chapters and stories in the background, with a live ETA and progress bar.",
  },
  {
    icon: MessageSquareQuote,
    title: "Ask the text",
    desc: "Question the document and get answers grounded in the actual excerpts, with citations to source chapters.",
  },
  {
    icon: Film,
    title: "Scene view",
    desc: "Toggle a cinematic scene-card overlay on the reader screen — each with a title, mood, and cast.",
  },
  {
    icon: Focus,
    title: "Focus mode & typography",
    desc: "Dim surrounding paragraphs, then tune font, size, line height, and reading width to your taste.",
  },
] as const;

const BEFORE_PARAGRAPH =
  "The room was narrow and dim, lit by a single lamp left burning though it was not yet dark. He sat at the desk, glanced at the open book, and rose again. Papers were everywhere. Outside, a bell rang, and then another. He went to the window and watched the light fail across the brick wall, thinking of the summer in the country, and of the letter she had never answered.";

type SceneCard = {
  title: string;
  mood: string;
  cast: string[];
  desc: string;
};

const DEMO_SCENE: SceneCard = {
  title: "The Threshold",
  mood: "hushed anticipation · dusk · interior",
  cast: ["The Stranger", "The Lamp-lighter"],
  desc: "A narrow room. The lamp left burning, though dusk has not yet come. Papers everywhere; a book lies open, face-down. He enters, sits, rises. A bell rings, and another. At the window, the light fails across the brick.",
};

const COMPARISON_SCENES: SceneCard[] = [
  {
    title: "I. The Room",
    mood: "stillness · dusk",
    cast: ["The Stranger"],
    desc: "A narrow room. A single lamp, lit too early. Papers everywhere; a book lies open, face-down.",
  },
  {
    title: "II. The Bells",
    mood: "unease · offscreen sound",
    cast: ["The Stranger", "The Bell"],
    desc: "He rises. A bell rings — and another. He crosses to the window. The brick wall holds the last of the light.",
  },
  {
    title: "III. The Letter",
    mood: "memory · slow ignition",
    cast: ["The Stranger", "She (absent)"],
    desc: "The country summer returns. The unanswered letter lies somewhere beneath the papers. He does not look for it.",
  },
];

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Bots", href: "#bots" },
      { label: "Features", href: "#features" },
      { label: "Demo", href: "#demo" },
    ],
  },
  {
    title: "Library",
    links: [
      { label: "Dashboard", view: "dashboard" as ViewName },
      { label: "Import", view: "upload" as ViewName },
      { label: "Create a story", view: "create" as ViewName },
      { label: "Settings", view: "settings" as ViewName },
    ],
  },
  {
    title: "About",
    links: [
      { label: "About Lemniscate", view: "settings" as ViewName, section: "about" },
      { label: "Privacy", view: "settings" as ViewName, section: "about" },
      { label: "Documentation", view: "settings" as ViewName, section: "about" },
    ],
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Small shared bits                                                          */
/* -------------------------------------------------------------------------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="ld-eyebrow">{children}</span>;
}

function CinematizedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("ld-chip ld-chip-purple", className)}>
      <Sparkles className="size-3" aria-hidden />
      Cinematized
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <Reveal
      className={
        align === "center"
          ? "mx-auto max-w-2xl text-center"
          : "max-w-2xl text-left"
      }
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="ld-display mt-3 text-4xl text-balance sm:text-5xl">
        {title}
      </h2>
      {sub ? (
        <p
          className="mt-4 text-base text-balance"
          style={{ color: "var(--ld-ink-dim)" }}
        >
          {sub}
        </p>
      ) : null}
    </Reveal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Nav — sticky, glassy when scrolled, purple accents                         */
/* -------------------------------------------------------------------------- */

function Nav({ go }: { go: GoFn }) {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b backdrop-blur-xl"
          : "border-b border-transparent",
      )}
      style={
        scrolled
          ? {
              background: "rgba(13, 14, 18, 0.72)",
              borderColor: "var(--ld-border)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }
          : undefined
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <button
          onClick={() => go("dashboard")}
          className="flex items-center gap-2 rounded-md focus-ring"
          aria-label="Lemniscate — open the reading room"
        >
          <FanLemniscateMark size={36} />
          <span className="font-display text-xl tracking-tight">Lemniscate</span>
        </button>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => scrollToAnchor(e, link.href)}
              className="story-link rounded-md text-sm transition-colors focus-ring"
              style={{ color: "var(--ld-ink-dim)" }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <MagneticButton
            onClick={() => go("dashboard")}
            className="ld-btn-primary shine-on-hover rounded-full px-5 py-2 text-sm font-semibold focus-ring"
          >
            Open the reading room
          </MagneticButton>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero — light + purple, aurora mesh, particles, mouse-tracking glow         */
/* -------------------------------------------------------------------------- */

function Hero({ go }: { go: GoFn }) {
  const heroRef = React.useRef<HTMLElement | null>(null);

  const onMouseMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

  return (
    <section
      ref={heroRef}
      onMouseMove={onMouseMove}
      className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28"
      style={{ "--mx": "50%", "--my": "28%" } as CSSVars}
    >
      {/* WebGL shader background — mouse-reactive indigo/violet gradient */}
      <ShaderBackground className="pointer-events-none absolute inset-0" />

      {/* Dot-grid overlay — subtle technical texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 ld-grid-overlay"
      />

      {/* Drifting purple orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.5), transparent 70%)",
          animation: "float-slow 18s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(167, 139, 250, 0.4), transparent 70%)",
          animation: "float-slow 24s ease-in-out infinite reverse",
        }}
      />

      {/* Floating particles */}
      <ParticleField count={16} />

      {/* Large faint fan-logo watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-24 opacity-[0.04]"
      >
        <FanLemniscateMark size={320} />
      </div>

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium backdrop-blur-md"
            style={{
              borderColor: "rgba(139, 92, 246, 0.2)",
              background: "rgba(139, 92, 246, 0.08)",
              color: "var(--ld-ink-dim)",
            }}
          >
            <FanLemniscateMark size={20} />
            The reading room, reimagined
          </span>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="ld-display mt-6 text-5xl text-balance sm:text-6xl lg:text-7xl">
            Meet <span className="text-gradient-purple">Luma</span>, your cosmic
            reading companion.
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p
            className="mx-auto mt-6 max-w-2xl text-base text-balance sm:text-lg"
            style={{ color: "var(--ld-ink-dim)" }}
          >
            Lemniscate — named for the lemniscate, the symbol of infinity (∞) —
            is a reading room where every document unfolds endlessly. Upload a
            PDF, EPUB, or Markdown file, or write your own story, and three AI
            minds meet you on the page: Luma for fast conversation, Ouro for
            literary study, and Ankaa for long-form creative writing.
          </p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <MagneticButton
              onClick={() => go("dashboard")}
              className="ld-btn-primary shine-on-hover inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold focus-ring sm:w-auto"
            >
              Start reading — it&apos;s free
              <ArrowRight className="size-4" />
            </MagneticButton>
            <button
              onClick={(e) => scrollToAnchor(e, "#demo")}
              className="ld-btn-ghost inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium focus-ring sm:w-auto"
            >
              See how it works
            </button>
          </div>
        </Reveal>

        <Reveal delay={320}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="mr-1" style={{ color: "var(--ld-ink-mute)" }}>
              Works with
            </span>
            {FILE_TYPES.map((type) => (
              <span
                key={type}
                className="ld-chip font-mono text-[11px]"
              >
                {type}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats band — animated counters                                             */
/* -------------------------------------------------------------------------- */

function StatsBand() {
  const stats = [
    { value: 6, suffix: "", label: "File formats" },
    { value: 3, suffix: "", label: "AI modes" },
    { value: 15, suffix: "+", label: "AI tools" },
    { value: 100, suffix: "%", label: "Free to use" },
  ];
  return (
    <section className="py-10">
      <div className="mx-auto max-w-5xl px-6">
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border md:grid-cols-4"
          style={{ borderColor: "var(--ld-border)", background: "var(--ld-border)" }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="px-6 py-7 text-center"
              style={{ background: "var(--ld-bg)" }}
            >
              <AnimatedCounter
                value={s.value}
                suffix={s.suffix}
                className="ld-display block text-3xl sm:text-4xl"
              />
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--ld-ink-mute)" }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  About Lemniscate — what it is, in detail                                    */
/* -------------------------------------------------------------------------- */

function AboutLemniscate({ go }: { go: GoFn }) {
  const tiles = [
    { icon: Upload, title: "Bring a document", desc: "PDF, EPUB, DOCX, Markdown, or text — parsed into chapters and stored locally.", action: "Import", view: "upload" as ViewName },
    { icon: Focus, title: "Read your way", desc: "Focus mode, adaptive fonts, and a cinematic scene overlay for long sessions.", action: "Open reader", view: "library" as ViewName },
    { icon: BookOpen, title: "Write your own", desc: "Hand the page to Ankaa and draft a complete story from brief to ending.", action: "Create a story", view: "create" as ViewName },
  ];
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeading
          eyebrow="What is Lemniscate"
          title="Where every reading loops back to you"
          sub="Named for the infinity symbol, Lemniscate turns a document into an endless conversation between reader and text."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {tiles.map((t, i) => {
            const Icon = t.icon;
            return (
              <Reveal key={t.title} delay={(i % 3) * 80}>
                <button
                  type="button"
                  onClick={() => go(t.view)}
                  className="ld-card ld-card-hover group flex h-full w-full flex-col items-start p-6 text-left"
                  style={{ borderColor: "var(--ld-border)" }}
                >
                  <div
                    className="mb-4 inline-flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                    style={{ background: "rgba(139, 92, 246, 0.12)", color: "var(--ld-purple-bright)" }}
                  >
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-display text-base font-medium">{t.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed" style={{ color: "var(--ld-ink-dim)" }}>
                    {t.desc}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--ld-purple-bright)" }}>
                    {t.action}
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

function InteractiveDemo() {
  return (
    <section id="demo" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="The transformation"
          title="From wall of text to living scene"
          sub="The same passage, reframed. On the left, raw prose. On the right, Lemniscate dramatizes it into a cinematic scene with mood, dialogue, and cast."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Before */}
          <Reveal>
            <article className="ld-card h-full p-6">
              <header className="flex items-center justify-between">
                <span
                  className="text-xs uppercase tracking-[0.16em]"
                  style={{ color: "var(--ld-ink-mute)" }}
                >
                  Before — plain text
                </span>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--ld-ink-faint)" }}
                >
                  chapter_03.txt
                </span>
              </header>
              <p
                className="mt-4 text-sm leading-relaxed"
                style={{ color: "var(--ld-ink-dim)" }}
              >
                {BEFORE_PARAGRAPH}
              </p>
              <div
                className="mt-5 flex items-center gap-2 text-[11px]"
                style={{ color: "var(--ld-ink-faint)" }}
              >
                <span
                  className="rounded border px-1.5 py-0.5 font-mono"
                  style={{ borderColor: "var(--ld-border)" }}
                >
                  312 words
                </span>
                <span
                  className="rounded border px-1.5 py-0.5 font-mono"
                  style={{ borderColor: "var(--ld-border)" }}
                >
                  1 paragraph
                </span>
              </div>
            </article>
          </Reveal>

          {/* After */}
          <Reveal delay={120}>
            <article className="ld-card ld-card-hover relative h-full overflow-hidden p-6">
              {/* Purple glow accent */}
              <div
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.65 0.24 285 / 0.6), transparent 70%)",
                  animation: "pulse-soft 4s ease-in-out infinite",
                }}
              />
              <header className="relative flex items-center justify-between gap-2">
                <span className="ld-eyebrow">After — scene card</span>
                <CinematizedBadge />
              </header>

              <h3 className="ld-display relative mt-4 text-2xl">
                {DEMO_SCENE.title}
              </h3>
              <p
                className="mt-1.5 text-xs"
                style={{ color: "var(--ld-purple-bright)" }}
              >
                Mood — {DEMO_SCENE.mood}
              </p>

              <p
                className="mt-4 text-sm leading-relaxed"
                style={{ color: "var(--ld-ink-dim)" }}
              >
                {DEMO_SCENE.desc}
              </p>

              <div
                className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4 text-[11px]"
                style={{ borderColor: "var(--ld-border)" }}
              >
                <span style={{ color: "var(--ld-ink-mute)" }}>Cast:</span>
                {DEMO_SCENE.cast.map((c) => (
                  <span key={c} className="ld-chip">
                    {c}
                  </span>
                ))}
              </div>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Meet the three AI minds — Luma, Ouro, Ankaa                                */
/* -------------------------------------------------------------------------- */

const BOTS_LANDING = [
  {
    name: "Luma",
    tag: "Normal Chatbot",
    desc: "Fast, vivid conversation that blends storytelling warmth with quick study help. Your everyday reading companion — retell a scene, explain a line, or imagine what's next, in seconds.",
    accent: "#a78bfa",
    Logo: LumaMark,
  },
  {
    name: "Ouro",
    tag: "Study Buddy",
    desc: "A literary study companion. Ouro builds study guides, generates quizzes you can take and score, and creates flip-cards — all grounded in the text you're reading.",
    accent: "#5eead4",
    Logo: OuroMark,
  },
  {
    name: "Ankaa",
    tag: "Agent Mode",
    desc: "A creative-writing agent for long-form work. Give Ankaa a brief and it weaves a full chapter or story in the background — with a live ETA and progress bar, so you're never left waiting in the dark.",
    accent: "#fb7185",
    Logo: AnkaaMark,
  },
] as const;

function MeetTheBots({ go }: { go: GoFn }) {
  return (
    <section id="bots" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Three voices, one page"
          title="Meet your AI companions"
          sub="Each mind brings a distinct craft to the text. Switch between them with a tap — they all read the same document you do."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {BOTS_LANDING.map((b, i) => {
            const Logo = b.Logo;
            return (
              <Reveal key={b.name} delay={(i % 3) * 90}>
                <article
                  className="ld-card ld-card-hover relative h-full overflow-hidden p-7"
                  style={{ borderColor: "var(--ld-border)" }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 opacity-20"
                    style={{ filter: `drop-shadow(0 0 16px ${b.accent})` }}
                  >
                    <Logo size={120} />
                  </div>
                  <div className="relative">
                    <div
                      className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl"
                      style={{ background: `color-mix(in oklab, ${b.accent} 14%, transparent)`, border: `1px solid ${b.accent}33` }}
                    >
                      <Logo size={36} />
                    </div>
                    <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: b.accent }}>
                      {b.tag}
                    </p>
                    <h3 className="ld-display mt-1 text-2xl">{b.name}</h3>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ld-ink-dim)" }}>
                      {b.desc}
                    </p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
        <Reveal delay={120}>
          <div className="mt-10 flex justify-center">
            <MagneticButton
              onClick={() => go("dashboard")}
              className="ld-btn-primary shine-on-hover inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold focus-ring"
            >
              Try them on a document
              <ArrowRight className="size-4" />
            </MagneticButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Features                                                                   */
/* -------------------------------------------------------------------------- */

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Built for every kind of reader"
          title="A reading room that grows with you"
          sub="Whether you're lost in a novel, sharing a bedtime story, or studying for an exam, the right AI voice is always one tap away."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 70}>
              <article className="ld-card ld-card-hover h-full p-6">
                <div
                  className="flex size-10 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(168, 85, 247, 0.12)",
                    color: "var(--ld-purple-bright)",
                  }}
                >
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-medium">{f.title}</h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--ld-ink-dim)" }}
                >
                  {f.desc}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Original vs Cinematized                                                    */
/* -------------------------------------------------------------------------- */

function OriginalVsCinematized() {
  return (
    <section
      className="border-y py-20 sm:py-28"
      style={{
        borderColor: "var(--ld-border)",
        background: "rgba(10, 11, 15, 0.4)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Side by side"
          title="The original, then Lemniscate"
          sub="Watch a single paragraph become a sequence of cinematic beats — each with a title, a mood, and a cast."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
          {/* The original */}
          <Reveal>
            <article className="ld-card h-full p-6">
              <header className="flex items-center justify-between">
                <span
                  className="text-xs uppercase tracking-[0.16em]"
                  style={{ color: "var(--ld-ink-mute)" }}
                >
                  The original
                </span>
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--ld-ink-faint)" }}
                >
                  raw.txt
                </span>
              </header>
              <p
                className="mt-4 text-sm leading-relaxed"
                style={{ color: "var(--ld-ink-dim)" }}
              >
                {BEFORE_PARAGRAPH}
              </p>
            </article>
          </Reveal>

          {/* Arrow divider */}
          <div className="flex items-center justify-center py-2 lg:py-12">
            <div
              className="flex size-12 items-center justify-center rounded-full border"
              style={{
                borderColor: "var(--ld-border-strong)",
                background: "rgba(168, 85, 247, 0.08)",
                color: "var(--ld-purple-bright)",
              }}
              aria-hidden
            >
              <ArrowRight className="size-5 rotate-90 lg:rotate-0" />
            </div>
          </div>

          {/* After Lemniscate */}
          <Reveal delay={120}>
            <div className="space-y-3">
              {COMPARISON_SCENES.map((scene, idx) => (
                <article
                  key={scene.title}
                  className="ld-card ld-card-hover relative overflow-hidden p-4"
                  style={{
                    animation: `stagger-in 500ms ease ${idx * 100}ms both`,
                  }}
                >
                  <header className="flex items-baseline justify-between gap-2">
                    <h4 className="ld-display text-lg">{scene.title}</h4>
                    <span
                      className="text-[11px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--ld-purple-bright)" }}
                    >
                      {scene.mood}
                    </span>
                  </header>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: "var(--ld-ink-dim)" }}
                  >
                    {scene.desc}
                  </p>
                  <div
                    className="mt-3 text-[11px]"
                    style={{ color: "var(--ld-ink-mute)" }}
                  >
                    Cast: {scene.cast.join(" · ")}
                  </div>
                </article>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------- */

function FinalCTA({ go }: { go: GoFn }) {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div
          className="relative overflow-hidden rounded-3xl border px-8 py-16 text-center sm:px-16 sm:py-24"
          style={{
            borderColor: "var(--ld-border-strong)",
            background:
              "radial-gradient(120% 100% at 50% 0%, rgba(139, 92, 246, 0.20), rgba(139, 92, 246, 0.04) 60%, transparent 100%), var(--ld-surface)",
          }}
        >
          {/* Animated glow orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 left-1/2 h-60 w-60 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(139, 92, 246, 0.6), transparent 70%)",
              animation: "pulse-soft 5s ease-in-out infinite",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 left-1/2 -translate-x-1/2 opacity-[0.05]"
          >
            <FanLemniscateMark size={200} />
          </div>
          <div className="relative">
            <Reveal>
              <h2 className="ld-display text-4xl text-balance sm:text-6xl">
                A companion for every kind of reader.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p
                className="mx-auto mt-4 max-w-xl text-base text-balance"
                style={{ color: "var(--ld-ink-dim)" }}
              >
                Bring a novel to expand, a story to share with a child, or a
                text to study. Lemniscate meets you where you are.
              </p>
            </Reveal>
            <Reveal delay={160}>
              <div className="mt-8 flex justify-center">
                <MagneticButton
                  onClick={() => go("dashboard")}
                  className="ld-btn-primary shine-on-hover inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold focus-ring"
                >
                  Open the reading room
                  <ArrowRight className="size-4" />
                </MagneticButton>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                     */
/* -------------------------------------------------------------------------- */

function Footer({ go }: { go: GoFn }) {
  return (
    <footer
      className="mt-auto border-t"
      style={{
        borderColor: "var(--ld-border)",
        background: "rgba(13, 14, 18, 0.6)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <FanLemniscateMark size={32} />
              <span className="font-display text-xl tracking-tight">Lemniscate</span>
            </div>
            <p
              className="mt-3 max-w-xs text-sm"
              style={{ color: "var(--ld-ink-mute)" }}
            >
              The reading room, reimagined. Local-first, AI-guided,
              typography-obsessed.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p
                className="text-xs uppercase tracking-[0.16em]"
                style={{ color: "var(--ld-ink-faint)" }}
              >
                {col.title}
              </p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"href" in link && link.href ? (
                      <a
                        href={link.href}
                        onClick={(e) => scrollToAnchor(e, link.href)}
                        className="rounded-md text-sm transition-colors focus-ring"
                        style={{ color: "var(--ld-ink-mute)" }}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          "view" in link && link.view
                            ? go(link.view as ViewName, "section" in link && link.section ? { section: link.section } : undefined)
                            : undefined
                        }
                        className="rounded-md text-sm transition-colors focus-ring"
                        style={{ color: "var(--ld-ink-mute)" }}
                      >
                        {link.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex items-center justify-between border-t pt-6"
          style={{ borderColor: "var(--ld-border)" }}
        >
          <p className="text-xs" style={{ color: "var(--ld-ink-mute)" }}>
            © 2026 Lemniscate. Made for readers.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => go("library")}
              className="text-xs transition-colors focus-ring"
              style={{ color: "var(--ld-ink-mute)" }}
            >
              <BookOpen className="inline size-3.5" /> Library
            </button>
            <FanLemniscateMark size={20} />
          </div>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  const go = useNav((s) => s.go);

  return (
    <div className="landing-dark relative flex min-h-dvh flex-col overflow-x-hidden">
      <a
        href="#main-content"
        className="skip-to-content"
        aria-label="Skip to main content"
      >
        Skip to content
      </a>
      <ScrollProgress />
      <Nav go={go} />
      <main id="main-content">
        <Hero go={go} />
        <StatsBand />
        <AboutLemniscate go={go} />
        <InteractiveDemo />
        <MeetTheBots go={go} />
        <Features />
        <OriginalVsCinematized />
        <FinalCTA go={go} />
      </main>
      <Footer go={go} />
    </div>
  );
}
