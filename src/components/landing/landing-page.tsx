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
  Keyboard,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  { label: "Features", href: "#features" },
  { label: "Demo", href: "#demo" },
  { label: "FAQ", href: "#faq" },
] as const;

const FILE_TYPES = ["PDF", "EPUB", "DOCX", "MD", "TXT", "HTML"] as const;

const ORGS = [
  "Plain Text Press",
  "Nightowl Books",
  "The Marginalia Society",
  "Ink & Antenna",
  "Long Form Co",
  "Vellum & Vapor",
  "The Slow Reader",
] as const;

const FEATURES = [
  {
    icon: Upload,
    title: "Upload anything",
    desc: "PDF, EPUB, DOCX, Markdown, TXT, HTML. Parsed into chapters on the server, stored in a persistent library.",
  },
  {
    icon: BookHeart,
    title: "Three AI minds",
    desc: "Luma for fast vivid chat, Ouro for NotebookLM-style study, and Ankaa for long-form creative writing.",
  },
  {
    icon: GraduationCap,
    title: "Study like a pro",
    desc: "Ouro builds study guides, flashcards, and quizzes from any passage — grounded, structured, ready to learn.",
  },
  {
    icon: Sparkles,
    title: "Long-form agent",
    desc: "Ankaa weaves full chapters and stories in the background, with a live ETA and progress bar.",
  },
  {
    icon: MessageSquareQuote,
    title: "Ask the text",
    desc: "Question the document. Get answers grounded in the actual excerpts, with citations to the source chapters.",
  },
  {
    icon: Film,
    title: "Cinematize",
    desc: "Turn prose into a sequence of cinematic scene cards — each with a title, mood, and cast of characters.",
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

const TESTIMONIALS = [
  {
    quote: "I finally finished Moby-Dick. The focus mode is a meditation.",
    name: "Ana R.",
    role: "Reader",
  },
  {
    quote:
      "Cinematize turned my dry research PDFs into something I actually want to read.",
    name: "Dev P.",
    role: "Researcher",
  },
  {
    quote: "It's the first e-reader that respects typography.",
    name: "Marguerite L.",
    role: "Editor",
  },
] as const;

const FAQS = [
  {
    q: "Is my data sent to a server?",
    a: "Your library is stored in a local database. Only when you explicitly request an AI feature is the relevant text sent to the model for that single request — and the results are cached so you rarely need to ask twice.",
  },
  {
    q: "What file types are supported?",
    a: "PDF, EPUB, DOCX, Markdown, TXT, and HTML. DOCX and EPUB are extracted from their zip containers; PDF uses a best-effort text extraction. Markdown and plain text are fully supported.",
  },
  {
    q: "What are the three AI bots?",
    a: "Luma is your fast, everyday chatbot — vivid storytelling plus quick study help. Ouro is a NotebookLM-style study assistant that builds study guides, quizzes, and flashcards. Ankaa is a creative-writing agent that weaves long-form chapters and stories in the background, with a live ETA.",
  },
  {
    q: "How does Ankaa's background writing work?",
    a: "Give Ankaa a brief — \"write the next chapter\", \"an alternate ending\", \"expand this scene\" — and it starts a background job. You'll see an estimated completion time and a live progress bar. When it's done, the full work appears in the chat ready to read.",
  },
  {
    q: "Can it really write the next chapter?",
    a: "Yes. Ankaa reads the document closely — absorbing its voice, rhythm, and tone — then writes a rich, detailed passage in the author's style. For long works it runs as a background agent with an ETA.",
  },
  {
    q: "Does it help with studying?",
    a: "Ouro generates structured study guides, creates multiple-choice quizzes you can take and score, builds flip-card flashcards, and explains any passage in plain language — all grounded in the text you're reading.",
  },
  {
    q: "Do I need an account?",
    a: "No. Lemniscate works as a local guest. Your library persists in the project database without any sign-in.",
  },
  { q: "Is it free?", a: "Yes. Lemniscate is free to use." },
] as const;

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Demo", href: "#demo" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Library",
    links: [
      { label: "Dashboard", view: "dashboard" as ViewName },
      { label: "Import", view: "upload" as ViewName },
      { label: "Settings", view: "settings" as ViewName },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Docs", href: "#" },
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
          <button
            onClick={() => go("dashboard")}
            className="ld-btn-ghost rounded-full px-4 py-2 text-sm font-medium focus-ring"
          >
            Sign in
          </button>
          <MagneticButton
            onClick={() => go("dashboard")}
            className="ld-btn-primary shine-on-hover rounded-full px-5 py-2 text-sm font-semibold focus-ring"
          >
            Get started
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
            Upload a PDF, EPUB, DOCX, or Markdown file — or write your own.
            Luma adapts to the reader you are: a Story Lover expanding a novel,
            a gentle voice retelling for children, or a patient tutor building
            study guides and quizzes. Chat freely, or tap a suggestion.
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
/*  Logo strip — marquee                                                       */
/* -------------------------------------------------------------------------- */

function LogoStrip() {
  const items = [...ORGS, ...ORGS]; // duplicate for seamless loop
  return (
    <section
      className="overflow-hidden border-y py-8"
      style={{
        borderColor: "var(--ld-border)",
        background: "rgba(10, 11, 15, 0.4)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <p
          className="mb-5 text-center text-xs uppercase tracking-[0.18em]"
          style={{ color: "var(--ld-ink-mute)" }}
        >
          Trusted by readers at
        </p>
      </div>
      <div className="relative">
        {/* Edge fade masks */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24"
          style={{
            background:
              "linear-gradient(90deg, var(--ld-bg), transparent)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24"
          style={{
            background:
              "linear-gradient(270deg, var(--ld-bg), transparent)",
          }}
        />
        <div className="ld-marquee gap-12 px-6">
          {items.map((org, i) => (
            <span
              key={`${org}-${i}`}
              className="whitespace-nowrap font-display text-lg transition-colors"
              style={{ color: "var(--ld-ink-mute)" }}
            >
              {org}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  InteractiveDemo — before / after                                           */
/* -------------------------------------------------------------------------- */

function InteractiveDemo() {
  return (
    <section id="demo" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="The transformation"
          title="From dense to vivid"
          sub="Same prose, two readings. On the left, the source. On the right, Lemniscate has cinematized the passage into a scene card."
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
    desc: "A NotebookLM-style study assistant. Ouro builds structured study guides, generates quizzes you can take and score, and creates flip-cards — all grounded in the text you're reading.",
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
          eyebrow="One panel, three minds"
          title="Meet your AI companions"
          sub="Each bot has a distinct personality and craft. Switch between them with a tap — they all share the document you're reading."
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
          eyebrow="One companion, three minds"
          title="A reading room that grows with you"
          sub="Whether you're lost in a novel, sharing a bedtime story, or studying for an exam, the AI companion adapts to the reader you are today."
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
/*  Testimonials                                                               */
/* -------------------------------------------------------------------------- */

function Testimonials() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="Loved by readers"
          title="Quiet praise"
          sub="Notes from people who picked Lemniscate back up after dinner."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => {
            const initials = t.name
              .split(" ")
              .map((p) => p[0])
              .join("");
            return (
              <Reveal key={t.name} delay={i * 80}>
                <figure className="ld-card ld-card-hover h-full p-6">
                  <blockquote
                    className="text-lg italic leading-relaxed"
                    style={{
                      fontFamily: "var(--font-display)",
                      color: "var(--ld-ink)",
                    }}
                  >
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <span
                      className="flex size-9 items-center justify-center rounded-full text-xs font-semibold"
                      style={{
                        background:
                          "linear-gradient(135deg, oklch(0.72 0.22 290), oklch(0.60 0.26 310))",
                        color: "#0a0a14",
                      }}
                      aria-hidden
                    >
                      {initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--ld-ink-mute)" }}
                      >
                        {t.role}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                        */
/* -------------------------------------------------------------------------- */

function FAQ() {
  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeading eyebrow="Questions" title="Frequently asked" />

        <Reveal delay={80} className="mt-8">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={faq.q}
                value={`item-${i}`}
                style={{ borderColor: "var(--ld-border)" }}
              >
                <AccordionTrigger className="px-1 text-left text-base font-medium">
                  <span
                    style={{ fontFamily: "var(--font-display)" }}
                    className="text-lg"
                  >
                    {faq.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent
                  className="px-1 text-sm leading-relaxed"
                  style={{ color: "var(--ld-ink-dim)" }}
                >
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                  */
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
                            ? go(link.view as ViewName)
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
            © 2025 Lemniscate. Made for readers.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => go("library")}
              className="text-xs transition-colors focus-ring"
              style={{ color: "var(--ld-ink-mute)" }}
            >
              <BookOpen className="inline size-3.5" /> Library
            </button>
            <span style={{ color: "var(--ld-ink-faint)" }}>·</span>
            <span className="text-xs" style={{ color: "var(--ld-ink-faint)" }}>
              <Keyboard className="inline size-3.5" /> Press ? for shortcuts
            </span>
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
        <LogoStrip />
        <InteractiveDemo />
        <MeetTheBots go={go} />
        <Features />
        <OriginalVsCinematized />
        <Testimonials />
        <FAQ />
        <FinalCTA go={go} />
      </main>
      <Footer go={go} />
    </div>
  );
}
