'use client'

import * as React from 'react'
import {
  motion,
  AnimatePresence,
  useInView,
} from 'framer-motion'
import { InfinityHero, InfinityFlow, Flourish } from '../logo'
import { useLemniscate } from '../store'
import {
  pageTransition,
  staggerContainer,
  revealUp,
  revealBlur,
  revealScale,
  hoverLift,
  hoverGlow,
} from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import {
  Film,
  Type,
  Users,
  TrendingUp,
  Activity,
  Heart,
  ShieldCheck,
  Check,
  ArrowRight,
  ArrowDown,
  Upload,
  Sparkles,
  Lock,
  Server,
  Cpu,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Floating amber particles ──────────────────────────────────────────────
function FloatingParticles() {
  // Deterministic particle config — avoids hydration mismatch.
  const particles = React.useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        left: 6 + i * 12 + (i % 3) * 4,
        size: 2 + (i % 3),
        delay: (i * 1.7) % 9,
        duration: 16 + (i % 4) * 4,
        drift: (i % 2 === 0 ? 1 : -1) * (18 + i * 4),
        opacity: 0.12 + (i % 4) * 0.05,
      })),
    []
  )

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: '-30px',
            width: p.size,
            height: p.size,
            backgroundColor: 'oklch(0.82 0.12 75)',
            boxShadow: '0 0 10px oklch(0.82 0.12 75 / 0.7)',
          }}
          initial={{ opacity: 0, y: 0, x: 0 }}
          animate={{
            opacity: [0, p.opacity, p.opacity * 0.5, p.opacity, 0],
            y: [0, -900],
            x: [0, p.drift, -p.drift, p.drift, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// ─── Section heading helper ────────────────────────────────────────────────
function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={revealUp}
      className="mb-4 flex items-center justify-center gap-3"
    >
      <span className="h-px w-8 bg-linear-to-r from-transparent to-amber/40" />
      <span className="font-mono text-xs uppercase tracking-[0.32em] text-amber/80">
        {children}
      </span>
      <span className="h-px w-8 bg-linear-to-l from-transparent to-amber/40" />
    </motion.div>
  )
}

// ─── Sample-story button (used twice) ──────────────────────────────────────
function useSampleHandler() {
  const openProcessing = useLemniscate((s) => s.openProcessing)
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)

  const run = React.useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/sample?mode=BOTH', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Sample creation failed')
      toast({
        title: 'Sample narrative queued',
        description:
          '“The Last Lighthouse of Veyrn” → Original + Cinematified.',
      })
      openProcessing(data.jobId, data.documentId)
    } catch (err) {
      toast({
        title: 'Could not start sample',
        description: (err as Error).message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [loading, openProcessing, toast])

  return { run, loading }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. HERO SECTION
// ═══════════════════════════════════════════════════════════════════════════

function HeroSection() {
  const { run, loading } = useSampleHandler()
  const openLibrary = useLemniscate((s) => s.openLibrary)

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-24 sm:px-6"
    >
      <FloatingParticles />

      {/* Soft amber spotlight that breathes behind the hero mark */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-[60%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, oklch(0.82 0.12 75 / 0.18) 0%, transparent 60%)',
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [0.96, 1.04, 0.96] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center"
      >
        {/* Hero infinity mark with gold glow */}
        <motion.div
          variants={revealBlur}
          className="relative mb-8 flex items-center justify-center"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 blur-2xl"
            style={{
              background:
                'radial-gradient(ellipse at center, oklch(0.82 0.12 75 / 0.35) 0%, transparent 70%)',
            }}
          />
          <InfinityHero className="relative h-24 w-48 sm:h-32 sm:w-64 lg:h-36 lg:w-72" />
        </motion.div>

        <motion.div
          variants={revealUp}
          className="mb-6 flex items-center justify-center"
        >
          <Flourish className="h-3 w-28 text-amber/70" />
        </motion.div>

        {/* Display headline */}
        <motion.h1
          id="hero-heading"
          variants={revealBlur}
          className="text-display text-balance text-ivory"
        >
          Transform Documents Into{' '}
          <span className="text-amber-gradient">Living Narratives</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={revealUp}
          className="mt-8 max-w-2xl text-pretty text-base leading-relaxed text-slate sm:text-lg"
          style={{ fontFamily: 'var(--font-reader)' }}
        >
          Upload a PDF, DOCX, or TXT. Lemniscate reconstructs it into immersive,
          cinematic storytelling — using only deterministic classical NLP.
          No AI. No cloud. Your content stays yours.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={revealUp}
          className="mt-10 flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <motion.div {...hoverLift} className="w-full sm:w-auto">
            <Button
              onClick={run}
              disabled={loading}
              size="lg"
              className="group relative h-12 w-full overflow-hidden bg-linear-to-r from-amber to-amber/80 px-8 text-midnight shadow-glow-amber transition-all hover:shadow-[0_0_60px_oklch(0.82_0.12_75/0.4)] sm:w-auto"
            >
              <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <AnimatePresence mode="wait" initial={false}>
                {loading ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2"
                  >
                    <motion.span
                      className="size-4 rounded-full border-2 border-midnight/40 border-t-midnight"
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                    Preparing the sample…
                  </motion.span>
                ) : (
                  <motion.span
                    key="idle"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="size-4" />
                    Try the Sample Story
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          <motion.div {...hoverLift} className="w-full sm:w-auto">
            <Button
              onClick={openLibrary}
              size="lg"
              variant="outline"
              className="h-12 w-full border-amber/30 bg-transparent px-8 text-ivory backdrop-blur-sm transition-all hover:border-amber/60 hover:bg-amber/5 sm:w-auto"
            >
              <Upload className="size-4" />
              Upload Your Own
            </Button>
          </motion.div>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          variants={revealUp}
          className="mt-12 flex flex-wrap items-center justify-center gap-3 text-sm"
        >
          {[
            { icon: Cpu, label: 'Offline · No AI' },
            { icon: ShieldCheck, label: 'Privacy-first' },
            { icon: Server, label: 'Self-hostable' },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full border border-amber/20 bg-midnight/40 px-4 py-1.5 text-slate backdrop-blur-sm"
            >
              <Icon className="size-3.5 text-amber" />
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                {label}
              </span>
            </div>
          ))}
        </motion.div>

        {/* Scroll cue */}
        <motion.div
          variants={revealUp}
          className="mt-16 flex flex-col items-center gap-2 text-amber/50"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.3em]">
            Scroll to explore
          </span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="h-8 w-px bg-linear-to-b from-amber/60 to-transparent"
          />
        </motion.div>
      </motion.div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LIVE TRANSFORMATION PREVIEW
// ═══════════════════════════════════════════════════════════════════════════

const RAW_SAMPLE = `The light-house keeper wal-
ked slowly across the wet
stones. The lamp had not
   been lit in se7en years.

"You should not be up here,"
called Marin from the foot of
the stairs."The council meeting
starts at noon."`

function TransformPreview() {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section
      aria-labelledby="preview-heading"
      className="relative px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          ref={ref}
          initial="initial"
          animate={inView ? 'animate' : 'initial'}
          variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <SectionEyebrow>The Transformation</SectionEyebrow>
          <motion.h2
            id="preview-heading"
            variants={revealBlur}
            className="text-headline text-center text-ivory"
          >
            From broken bytes to{' '}
            <span className="text-amber-gradient">cinematic form</span>
          </motion.h2>
          <motion.p
            variants={revealUp}
            className="mt-4 max-w-xl text-center text-slate"
          >
            Watch the same passage travel from raw, hyphenated upload through
            deterministic reconstruction into a screenplay scene.
          </motion.p>

          {/* Side-by-side */}
          <div className="mt-16 grid w-full items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
            {/* RAW CARD */}
            <motion.div variants={revealScale} className="relative">
              <div className="mb-3 flex items-center gap-2 text-slate">
                <FileText className="size-4 text-slate/70" />
                <span className="font-mono text-xs uppercase tracking-[0.2em]">
                  Raw Document
                </span>
              </div>
              <div className="surface-raised relative h-full overflow-hidden rounded-xl p-5">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-[0.06]"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, transparent, transparent 23px, oklch(0.82 0.12 75 / 0.6) 23px, oklch(0.82 0.12 75 / 0.6) 24px)',
                  }}
                />
                <pre className="relative whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate/80 sm:text-sm">
                  {RAW_SAMPLE}
                </pre>
                {/* messy indicators */}
                <div className="absolute bottom-3 right-3 flex gap-1">
                  <span className="size-1.5 rounded-full bg-tension/60" />
                  <span className="size-1.5 rounded-full bg-amber/40" />
                  <span className="size-1.5 rounded-full bg-slate/40" />
                </div>
              </div>
            </motion.div>

            {/* ARROW / FLOW */}
            <motion.div
              variants={revealUp}
              className="flex items-center justify-center py-4 lg:py-0"
            >
              {/* horizontal (desktop) */}
              <div className="hidden flex-col items-center gap-2 lg:flex">
                <InfinityFlow className="h-10 w-20 text-amber/70" />
                <motion.div
                  animate={{ x: [0, 6, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <ArrowRight className="size-5 text-amber" />
                </motion.div>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
                  Lemniscate
                </span>
              </div>
              {/* vertical (mobile) */}
              <div className="flex flex-col items-center gap-2 lg:hidden">
                <InfinityFlow className="h-10 w-20 rotate-90 text-amber/70" />
                <motion.div
                  animate={{ y: [0, 6, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <ArrowDown className="size-5 text-amber" />
                </motion.div>
              </div>
            </motion.div>

            {/* CINEMATIFIED CARD */}
            <motion.div variants={revealScale} className="relative">
              <div className="mb-3 flex items-center gap-2">
                <Film className="size-4 text-amber" />
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber">
                  Cinematified Narrative
                </span>
              </div>
              <div className="surface-raised relative h-full overflow-hidden rounded-xl p-5 shadow-cinema">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, oklch(0.82 0.12 75 / 0.18) 0%, transparent 70%)',
                  }}
                />
                {/* Scene heading */}
                <div className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-amber/80 sm:text-xs">
                  INT. LIGHTHOUSE COTTAGE — DAWN
                </div>
                {/* Narration */}
                <p
                  className="mb-4 text-pretty text-sm leading-relaxed text-ivory sm:text-base"
                  style={{ fontFamily: 'var(--font-reader)' }}
                >
                  The sea whispers. Elara stands at the window, watching grey
                  waves chew the rocks below.
                </p>
                {/* Dialogue block 1 */}
                <div className="mb-4 text-center">
                  <div className="font-mono text-xs uppercase tracking-[0.15em] text-amber/90 sm:text-sm">
                    MARIN
                  </div>
                  <div
                    className="mx-auto max-w-[80%] text-center text-xs italic text-ivory/90 sm:text-sm"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    You should not be up here. The council meeting starts at
                    noon.
                  </div>
                </div>
                {/* Dialogue block 2 */}
                <div className="text-center">
                  <div className="font-mono text-xs uppercase tracking-[0.15em] text-amber/90 sm:text-sm">
                    ELARA
                  </div>
                  <div
                    className="mx-auto max-w-[80%] text-center text-xs italic text-ivory/90 sm:text-sm"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    The council can wait. The sea cannot.
                  </div>
                </div>
                {/* meta tags */}
                <div className="mt-5 flex flex-wrap gap-1.5 border-t border-amber/15 pt-3">
                  {['Scene 1', '2 Characters', 'Tension 0.62', 'Calm→Climax'].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-amber/20 bg-amber/5 px-2 py-0.5 font-mono text-[10px] text-amber/80"
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TWO MODES SHOWCASE
// ═══════════════════════════════════════════════════════════════════════════

const MODES = [
  {
    icon: Type,
    badge: 'ORIGINAL',
    title: 'Faithful Reconstruction',
    description:
      'Preserve source meaning. Repair formatting. Reconstruct proper paragraphs. Improve readability only.',
    features: [
      'Whitespace, quote, and hyphenation repair',
      'Mid-sentence block merge across page breaks',
      'Topic-shift paragraph splitting',
      'Paragraph classification: narration, dialogue, action',
      'Markdown-rendered, faithful to source',
    ],
    accent: 'slate' as const,
  },
  {
    icon: Film,
    badge: 'CINEMATIFIED',
    title: 'Cinematic Storytelling',
    description:
      'Detect scenes, characters, locations, events, narrative arcs, tension, and emotional peaks. Reconstruct into cinematic storytelling. Never invents facts.',
    features: [
      'Scene segmentation (location · time · topic · heading)',
      'Character detection with role classification',
      'Location & event detection',
      'Five-zone narrative arc mapping',
      'Per-scene tension + emotional peak scoring',
      'Screenplay-style reconstruction (verbatim source)',
    ],
    accent: 'amber' as const,
    featured: true,
  },
]

function TwoModesShowcase() {
  return (
    <section
      aria-labelledby="modes-heading"
      className="relative px-4 py-24 sm:px-6 sm:py-32"
    >
      {/* soft amber backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 50%, oklch(0.82 0.12 75 / 0.06) 0%, transparent 70%)',
        }}
      />
      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <SectionEyebrow>Two Reading Experiences</SectionEyebrow>
          <motion.h2
            id="modes-heading"
            variants={revealBlur}
            className="text-headline text-center text-ivory"
          >
            Choose how the{' '}
            <span className="text-amber-gradient">story unfolds</span>
          </motion.h2>
          <motion.p
            variants={revealUp}
            className="mt-4 max-w-xl text-center text-slate"
          >
            Each mode runs entirely deterministic classical NLP. Pick the
            faithful reading or the cinematic reconstruction — or run both.
          </motion.p>

          <div className="mt-16 grid w-full gap-6 lg:grid-cols-2">
            {MODES.map((mode) => {
              const Icon = mode.icon
              return (
                <motion.div
                  key={mode.badge}
                  variants={revealScale}
                  {...hoverGlow}
                  whileHover={{ y: -6 }}
                  className={`surface-raised group relative flex flex-col overflow-hidden rounded-2xl p-8 shadow-cinema transition-colors ${
                    mode.featured
                      ? 'border-amber/40'
                      : 'border-amber/10 hover:border-amber/25'
                  }`}
                >
                  {mode.featured && (
                    <>
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
                        style={{
                          background:
                            'radial-gradient(circle, oklch(0.82 0.12 75 / 0.22) 0%, transparent 70%)',
                        }}
                      />
                      <div className="absolute right-6 top-6">
                        <Badge className="border-amber/40 bg-amber/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-amber">
                          Recommended
                        </Badge>
                      </div>
                    </>
                  )}

                  <div className="relative mb-6 flex items-center gap-4">
                    <div
                      className={`flex size-14 items-center justify-center rounded-xl border ${
                        mode.featured
                          ? 'border-amber/40 bg-amber/10'
                          : 'border-amber/20 bg-midnight/40'
                      }`}
                    >
                      <Icon
                        className={`size-6 ${
                          mode.featured ? 'text-amber' : 'text-slate'
                        }`}
                      />
                    </div>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber/70">
                        {mode.badge} MODE
                      </div>
                      <h3 className="text-title mt-1 text-ivory">
                        {mode.title}
                      </h3>
                    </div>
                  </div>

                  <p
                    className="relative mb-6 text-pretty leading-relaxed text-slate"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    {mode.description}
                  </p>

                  <ul className="relative mt-auto space-y-3">
                    {mode.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-3 text-sm text-ivory/85"
                      >
                        <span
                          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                            mode.featured
                              ? 'bg-amber/20 text-amber'
                              : 'bg-slate/20 text-slate'
                          }`}
                        >
                          <Check className="size-3" />
                        </span>
                        <span style={{ fontFamily: 'var(--font-sans-stack)' }}>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FEATURE HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════════════════

const FEATURES = [
  {
    icon: Film,
    title: 'Intelligent Scene Mapping',
    description:
      'Automatically finds where each scene begins and ends — following shifts in place, time, and focus.',
  },
  {
    icon: Users,
    title: 'Character Intelligence',
    description:
      'Recognizes who matters — leads, rivals, and supporting cast — and how often each one appears.',
  },
  {
    icon: TrendingUp,
    title: 'Story Structure Analysis',
    description:
      'Maps the shape of your story, from the opening spark through the climax to its resolution.',
  },
  {
    icon: Activity,
    title: 'Narrative Momentum',
    description:
      'Tracks how the pressure rises and falls across the book, scene by scene.',
  },
  {
    icon: Heart,
    title: 'Emotional Journey',
    description:
      'Follows the emotional highs and lows of the narrative to reveal its most affecting moments.',
  },
  {
    icon: ShieldCheck,
    title: 'Offline & Private by Design',
    description:
      'Everything runs on your own machine. No AI APIs. No cloud calls. Your manuscript never leaves.',
  },
]

function FeatureHighlights() {
  return (
    <section
      aria-labelledby="features-heading"
      className="relative px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <SectionEyebrow>The Engineering</SectionEyebrow>
          <motion.h2
            id="features-heading"
            variants={revealBlur}
            className="text-headline text-center text-ivory"
          >
            Classical NLP,{' '}
            <span className="text-amber-gradient">deeply considered</span>
          </motion.h2>
          <motion.p
            variants={revealUp}
            className="mt-4 max-w-xl text-center text-slate"
          >
            Six deterministic engines work together to reveal the structure
            hidden inside your documents. No black boxes. No hallucinations.
          </motion.p>

          <div className="mt-16 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <motion.div
                  key={f.title}
                  variants={revealUp}
                  {...hoverGlow}
                  whileHover={{ y: -4 }}
                  className="surface-raised group relative overflow-hidden rounded-xl p-6 transition-colors hover:border-amber/30"
                >
                  {/* icon */}
                  <div className="mb-5 flex size-12 items-center justify-center rounded-lg border border-amber/20 bg-linear-to-br from-amber/10 to-transparent">
                    <Icon className="size-5 text-amber" />
                  </div>
                  <h3 className="text-title mb-2 text-ivory">{f.title}</h3>
                  <p
                    className="text-sm leading-relaxed text-slate"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    {f.description}
                  </p>

                  {/* hover indicator */}
                  <div className="mt-5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <span>Deterministic</span>
                    <ChevronRight className="size-3" />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. STATS STRIP
// ═══════════════════════════════════════════════════════════════════════════

const STATS = [
  { value: '∞', label: 'Narratives', sub: 'Created without AI' },
  { value: '100%', label: 'Offline', sub: 'No cloud required' },
  { value: '0', label: 'AI APIs', sub: 'Zero neural calls' },
  { value: 'Classical', label: 'NLP', sub: 'Deterministic & reproducible' },
]

function StatsStrip() {
  return (
    <section
      aria-label="Key statistics"
      className="px-4 py-12 sm:px-6"
    >
      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, margin: '-60px' }}
        variants={staggerContainer}
        className="glass mx-auto flex max-w-6xl flex-col gap-6 rounded-2xl p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between"
      >
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            variants={revealScale}
            className={`flex flex-col items-center text-center lg:flex-1 ${
              i < STATS.length - 1
                ? 'lg:border-r lg:border-amber/15'
                : ''
            }`}
          >
            <div className="text-display shimmer-text leading-none">
              {stat.value}
            </div>
            <div className="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-amber">
              {stat.label}
            </div>
            <div className="mt-1 text-xs text-slate">{stat.sub}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. FAQ
// ═══════════════════════════════════════════════════════════════════════════

const FAQS = [
  {
    q: 'Is this an AI writer?',
    a: 'No. Lemniscate uses deterministic classical NLP — tokenization, gazetteer matching, regex, and curated lexicons. There are no neural networks, no LLMs, no probabilistic generation. Every transformation is fully reproducible: the same input always yields the same output, byte for byte.',
  },
  {
    q: 'What file types are supported?',
    a: 'PDF, DOCX, DOC, plain TXT, and Markdown. PDF parsing runs in an isolated child process so a malformed file never crashes the server. DOCX uses mammoth; TXT and Markdown are read directly. Files up to 25 MB are accepted.',
  },
  {
    q: 'Does my data leave my device?',
    a: 'Never. All processing happens in-process or in your own self-hosted worker. No content is sent to external APIs. The only network requests are the local API calls between your browser and the Lemniscate service running on your machine or server.',
  },
  {
    q: 'Can I self-host?',
    a: 'Yes. The entire stack is open and self-hostable: Next.js + Prisma + SQLite + an optional Redis-compatible queue. One command starts the worker; the web service can run with an embedded poller so you don’t even need Redis. Deploy on a single VM or a container.',
  },
  {
    q: 'How does the cinematification work?',
    a: 'Classical NLP detects scenes (location, time, topic, heading boundaries), characters (honorifics + attribution verbs + proper nouns), locations (gazetteers + prepositional phrases), events (action verbs + signal lexicons), and per-scene tension & emotion (AFINN-style valence with negation and intensifier multipliers). The source text is never invented — only structurally reorganized into cinematic form with INT./EXT. headings, screenplay dialogue, and transition cues.',
  },
]

function FAQ() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="relative px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-3xl">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={staggerContainer}
          className="flex flex-col items-center"
        >
          <SectionEyebrow>Questions</SectionEyebrow>
          <motion.h2
            id="faq-heading"
            variants={revealBlur}
            className="text-headline text-center text-ivory"
          >
            Frequently{' '}
            <span className="text-amber-gradient">asked</span>
          </motion.h2>
        </motion.div>

        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
          variants={revealUp}
          className="mt-12"
        >
          <Card className="glass gap-0 rounded-2xl border-amber/15 px-6 py-2 sm:px-8">
          <Accordion
            type="single"
            collapsible
            defaultValue="faq-0"
          >
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={faq.q}
                value={`faq-${i}`}
                className="border-amber/15"
              >
                <AccordionTrigger className="text-left text-base font-medium text-ivory hover:text-amber hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p
                    className="text-pretty leading-relaxed text-slate"
                    style={{ fontFamily: 'var(--font-reader)' }}
                  >
                    {faq.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          </Card>
        </motion.div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. FINAL CTA
// ═══════════════════════════════════════════════════════════════════════════

function FinalCTA() {
  const { run, loading } = useSampleHandler()

  return (
    <section
      aria-labelledby="cta-heading"
      className="relative overflow-hidden px-4 py-32 sm:px-6 sm:py-40"
    >
      {/* amber glow background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 70% at 50% 50%, oklch(0.82 0.12 75 / 0.18) 0%, transparent 60%)',
        }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, oklch(0.82 0.12 75 / 0.12) 0%, transparent 70%)',
        }}
        animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, margin: '-80px' }}
        variants={staggerContainer}
        className="relative mx-auto flex max-w-3xl flex-col items-center text-center"
      >
        <motion.div variants={revealBlur}>
          <InfinityHero className="mx-auto mb-8 h-16 w-32 sm:h-20 sm:w-40" />
        </motion.div>

        <motion.h2
          id="cta-heading"
          variants={revealBlur}
          className="text-display text-balance text-ivory"
        >
          Begin Your{' '}
          <span className="text-amber-gradient">Narrative Journey</span>
        </motion.h2>

        <motion.p
          variants={revealUp}
          className="mt-6 max-w-xl text-pretty text-slate"
          style={{ fontFamily: 'var(--font-reader)' }}
        >
          One click. No signup. Watch a 90-second transformation from raw text
          into cinematic storytelling — entirely on your machine.
        </motion.p>

        <motion.div
          variants={revealScale}
          {...hoverLift}
          className="mt-10"
        >
          <Button
            onClick={run}
            disabled={loading}
            size="lg"
            className="group relative h-14 overflow-hidden bg-linear-to-r from-amber to-amber/80 px-10 text-lg text-midnight shadow-glow-amber transition-all hover:shadow-[0_0_80px_oklch(0.82_0.12_75/0.5)]"
          >
            <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {loading ? (
              <>
                <motion.span
                  className="size-5 rounded-full border-2 border-midnight/40 border-t-midnight"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
                Preparing…
              </>
            ) : (
              <>
                <Sparkles className="size-5" />
                Try the Sample Story
              </>
            )}
          </Button>
        </motion.div>

        <motion.div
          variants={revealUp}
          className="mt-6 flex items-center gap-2 text-xs text-slate"
        >
          <Lock className="size-3 text-amber/60" />
          <span className="font-mono uppercase tracking-[0.2em]">
            No account · No upload · No AI
          </span>
        </motion.div>
      </motion.div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. FOOTER SPACE
// ═══════════════════════════════════════════════════════════════════════════

function LandingFooter() {
  return (
    <footer className="px-4 pb-12 pt-8 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <Flourish className="h-3 w-32 text-amber/50" />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.25em] text-slate">
          <span>Lemniscate</span>
          <span className="text-amber/40">∞</span>
          <span>Deterministic</span>
          <span className="text-amber/40">∞</span>
          <span>Offline</span>
          <span className="text-amber/40">∞</span>
          <span>Yours</span>
        </div>
        <p className="text-xs text-slate/60">
          © {new Date().getFullYear()} Lemniscate. Transform documents into
          living narratives — no AI, no cloud, no compromise.
        </p>
      </div>
    </footer>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function LandingPage() {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      className="relative"
    >
      <HeroSection />
      <TransformPreview />
      <TwoModesShowcase />
      <FeatureHighlights />
      <StatsStrip />
      <FAQ />
      <FinalCTA />
      <LandingFooter />
    </motion.div>
  )
}
