'use client'

/**
 * Lemniscate — Scene explorer timelines
 * ----------------------------------------------------------------------------
 * The three per-scene bar visualizations: tension, momentum, and emotional
 * valence. Each is a prop-driven presentational component; the markup was
 * extracted verbatim from `scenes.tsx` and behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { spring } from '@/lib/motion'
import { Activity, TrendingUp, Heart } from 'lucide-react'
import type { ApiScene } from '@/lib/types'

interface TimelineProps {
  scenes: ApiScene[]
  selected: ApiScene | null
  onSelect: (s: ApiScene) => void
}

// ─── Tension timeline ─────────────────────────────────────────────────────────

export function TensionTimeline({
  scenes,
  selected,
  onSelect,
  maxTension,
}: TimelineProps & { maxTension: number }) {
  return (
    <Card className="border-amber/12 surface-raised">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber/60">
          <Activity className="h-3.5 w-3.5" /> Tension Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative flex h-24 items-end gap-1">
          {scenes.map((s, i) => {
            const score = s.tensionScore || 0
            const heightPct =
              maxTension > 0 ? Math.max(6, (score / maxTension) * 100) : 6
            const isSelected = selected?.id === s.id
            return (
              <motion.button
                key={s.id}
                onClick={() => onSelect(s)}
                initial={{ height: '6%' }}
                animate={{ height: `${heightPct}%` }}
                transition={{ delay: i * 0.03, ...spring.gentle }}
                className={`relative flex-1 rounded-t-md transition-colors ${
                  isSelected
                    ? 'bg-linear-to-t from-amber to-burgundy'
                    : 'bg-linear-to-t from-amber/40 via-amber/30 to-amber/20 hover:from-amber/60 hover:via-amber/50 hover:to-amber/40'
                }`}
                title={`Scene ${i + 1}: ${score}% tension`}
              />
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate/50">
          <span>Scene 1</span>
          <span>Scene {scenes.length}</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Momentum timeline ──────────────────────────────────────────────────────

export function MomentumTimeline({
  scenes,
  selected,
  onSelect,
  maxMomentum,
  avgMomentum,
}: TimelineProps & { maxMomentum: number; avgMomentum: number }) {
  return (
    <Card className="border-amber/12 surface-raised">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber/60">
          <TrendingUp className="h-3.5 w-3.5" /> Momentum Timeline
          <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-slate/60">
            avg {avgMomentum}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="relative flex h-24 items-end gap-1"
          role="img"
          aria-label={`Narrative momentum across ${scenes.length} scenes, average ${avgMomentum} out of 100`}
        >
          {scenes.map((s, i) => {
            const score = s.momentumScore || 0
            const heightPct = Math.max(6, (score / maxMomentum) * 100)
            const isSelected = selected?.id === s.id
            return (
              <motion.button
                key={s.id}
                onClick={() => onSelect(s)}
                initial={{ height: '6%' }}
                animate={{ height: `${heightPct}%` }}
                transition={{ delay: i * 0.03, ...spring.gentle }}
                className={`relative flex-1 rounded-t-md transition-colors ${
                  isSelected
                    ? 'bg-linear-to-t from-calm to-amber'
                    : 'bg-linear-to-t from-calm/40 via-calm/30 to-calm/20 hover:from-calm/60 hover:via-calm/50 hover:to-calm/40'
                }`}
                title={`Scene ${i + 1}: momentum ${score}`}
                aria-label={`Scene ${i + 1}, momentum ${score} out of 100`}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Emotional timeline (valence above/below the neutral line) ───────────────

export function EmotionalTimeline({
  scenes,
  selected,
  onSelect,
  maxAbsValence,
}: TimelineProps & { maxAbsValence: number }) {
  return (
    <Card className="border-amber/12 surface-raised">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber/60">
          <Heart className="h-3.5 w-3.5" /> Emotional Timeline
          <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-slate/60">
            valence
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="relative flex h-24 items-center gap-1"
          role="img"
          aria-label={`Emotional valence across ${scenes.length} scenes; bars above the line are positive, below are negative`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-amber/15" aria-hidden="true" />
          {scenes.map((s, i) => {
            const v = s.valence || 0
            const magnitude = Math.max(4, (Math.abs(v) / maxAbsValence) * 44)
            const positive = v >= 0
            const isSelected = selected?.id === s.id
            const posClass = isSelected ? 'bg-amber/90' : 'bg-amber/50'
            const negClass = isSelected ? 'bg-burgundy/90' : 'bg-burgundy/50'
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="relative flex h-full flex-1 flex-col"
                title={`Scene ${i + 1}: valence ${v}`}
                aria-label={`Scene ${i + 1}, valence ${v} from -100 to 100`}
              >
                <span className="flex flex-1 items-end justify-center">
                  {positive && (
                    <motion.span
                      initial={{ height: 4 }}
                      animate={{ height: magnitude }}
                      transition={{ delay: i * 0.03, ...spring.gentle }}
                      className={`w-full rounded-t-sm ${posClass}`}
                    />
                  )}
                </span>
                <span className="flex flex-1 items-start justify-center">
                  {!positive && (
                    <motion.span
                      initial={{ height: 4 }}
                      animate={{ height: magnitude }}
                      transition={{ delay: i * 0.03, ...spring.gentle }}
                      className={`w-full rounded-b-sm ${negClass}`}
                    />
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate/60">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber/60" /> Positive
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-burgundy/60" /> Negative
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
