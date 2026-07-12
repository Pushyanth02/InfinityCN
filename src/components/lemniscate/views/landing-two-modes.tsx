'use client'

/**
 * Lemniscate — Landing two-modes showcase
 * ----------------------------------------------------------------------------
 * The ORIGINAL vs CINEMATIFIED comparison cards. Extracted verbatim from
 * `landing.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { staggerContainer, revealUp, revealBlur, revealScale, hoverGlow } from '@/lib/motion'
import { Badge } from '@/components/ui/badge'
import { Film, Type, Check } from 'lucide-react'
import { SectionEyebrow } from './landing-shared'

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

export function TwoModesShowcase() {
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
