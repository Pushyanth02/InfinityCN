'use client'

/**
 * Lemniscate — Landing stats strip
 * ----------------------------------------------------------------------------
 * The key-statistics band ("∞ narratives · 100% offline · 0 AI APIs").
 * Extracted verbatim from `landing.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { staggerContainer, revealScale } from '@/lib/motion'

// ═══════════════════════════════════════════════════════════════════════════
// 5. STATS STRIP
// ═══════════════════════════════════════════════════════════════════════════

const STATS = [
  { value: '∞', label: 'Narratives', sub: 'Created without AI' },
  { value: '100%', label: 'Offline', sub: 'No cloud required' },
  { value: '0', label: 'AI APIs', sub: 'Zero neural calls' },
  { value: 'Classical', label: 'NLP', sub: 'Deterministic & reproducible' },
]

export function StatsStrip() {
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
