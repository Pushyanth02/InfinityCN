'use client'

/**
 * Lemniscate — Landing feature highlights
 * ----------------------------------------------------------------------------
 * The six-card grid describing the deterministic engines. Extracted verbatim
 * from `landing.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { staggerContainer, revealUp, revealBlur, hoverGlow } from '@/lib/motion'
import {
  Film,
  Users,
  TrendingUp,
  Activity,
  Heart,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { SectionEyebrow } from './landing-shared'

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

export function FeatureHighlights() {
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
