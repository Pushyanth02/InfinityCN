'use client'

/**
 * Lemniscate — Landing final CTA
 * ----------------------------------------------------------------------------
 * The closing call-to-action with the breathing amber glow. Extracted verbatim
 * from `landing.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { InfinityHero } from '../logo'
import { staggerContainer, revealUp, revealBlur, revealScale, hoverLift } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Sparkles, Lock } from 'lucide-react'
import { useSampleHandler } from './landing-shared'

// ═══════════════════════════════════════════════════════════════════════════
// 7. FINAL CTA
// ═══════════════════════════════════════════════════════════════════════════

export function FinalCTA() {
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
