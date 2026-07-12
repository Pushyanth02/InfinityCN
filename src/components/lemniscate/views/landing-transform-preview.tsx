'use client'

/**
 * Lemniscate — Landing transformation preview
 * ----------------------------------------------------------------------------
 * The side-by-side "raw document → cinematified narrative" showcase. Extracted
 * verbatim from `landing.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { motion, useInView } from 'framer-motion'
import { InfinityFlow } from '../logo'
import { staggerContainer, revealUp, revealBlur, revealScale } from '@/lib/motion'
import { FileText, Film, ArrowRight, ArrowDown } from 'lucide-react'
import { SectionEyebrow } from './landing-shared'

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

export function TransformPreview() {
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
