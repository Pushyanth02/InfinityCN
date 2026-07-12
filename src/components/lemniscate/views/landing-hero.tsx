'use client'

/**
 * Lemniscate — Landing hero section
 * ----------------------------------------------------------------------------
 * The above-the-fold hero: infinity mark, headline, CTAs, trust badges, and
 * scroll cue. Extracted verbatim from `landing.tsx`; behavior is unchanged.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { InfinityHero, Flourish } from '../logo'
import { useLemniscate } from '../store'
import { staggerContainer, revealUp, revealBlur, hoverLift } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Upload, Sparkles, Server, Cpu } from 'lucide-react'
import { FloatingParticles, useSampleHandler } from './landing-shared'

// ═══════════════════════════════════════════════════════════════════════════
// 1. HERO SECTION
// ═══════════════════════════════════════════════════════════════════════════

export function HeroSection() {
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
