'use client'

/**
 * Lemniscate — Processing pipeline stages
 * ----------------------------------------------------------------------------
 * The six-step pipeline strip that marks each stage done/active/pending based
 * on the current stage and status. Extracted verbatim from `processing.tsx`;
 * behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { staggerContainer, revealUp } from '@/lib/motion'
import { STAGES } from './processing-shared'

const STAGE_ORDER = ['EXTRACT', 'SEGMENT', 'ORIGINAL', 'CINEMATIFY', 'ANALYZE', 'FINALIZE']

export function PipelineStages({ stage, status }: { stage: string; status: string }) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {STAGES.map((s, i) => {
        const currentIdx = STAGE_ORDER.indexOf(stage)
        const done = currentIdx > i || status === 'COMPLETED'
        const active = currentIdx === i && status !== 'COMPLETED' && status !== 'FAILED'
        // Plain-text state for screen readers — the visual state is color-only
        // otherwise (done/active/pending), which is invisible to AT users.
        const stateLabel = done ? `${s.label}: complete` : active ? `${s.label}: in progress` : `${s.label}: pending`
        const Icon = s.icon
        return (
          <motion.div
            key={s.key}
            variants={revealUp}
            role="img"
            aria-label={stateLabel}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-colors ${
              done
                ? 'border-calm/25 bg-calm/5'
                : active
                  ? 'border-amber/40 bg-amber/8 pulse-amber'
                  : 'border-amber/8 bg-midnight/30'
            }`}
          >
            <Icon className={`h-4 w-4 ${done ? 'text-calm' : active ? 'text-amber' : 'text-slate/40'}`} />
            <span className={`text-[10px] font-medium ${done || active ? 'text-ivory' : 'text-slate/50'}`}>{s.label}</span>
            {i < STAGES.length - 1 && (
              <div className="absolute right-[-8px] top-1/2 h-px w-4 -translate-y-1/2 bg-amber/10" />
            )}
          </motion.div>
        )
      })}
    </motion.div>
  )
}
