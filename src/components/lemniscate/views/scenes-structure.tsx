'use client'

/**
 * Lemniscate — Scene explorer structure & arcs
 * ----------------------------------------------------------------------------
 * The dramatic-structure phase band (with key beats) and the narrative-arc
 * intensity map. Prop-driven presentational components; markup extracted
 * verbatim from `scenes.tsx` and behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { spring } from '@/lib/motion'
import { Layers, Milestone } from 'lucide-react'
import type { ApiScene, ApiNarrativeArc, ApiStoryStructure } from '@/lib/types'
import { PHASE_LABEL } from './scenes-shared'

// ─── Story structure ─────────────────────────────────────────────────────────

export function StoryStructureCard({
  structure,
  scenes,
}: {
  structure: ApiStoryStructure
  scenes: ApiScene[]
}) {
  return (
    <Card className="border-amber/12 surface-raised">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber/60">
          <Milestone className="h-3.5 w-3.5" /> Story Structure
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Proportional phase band */}
        <div className="flex h-8 w-full overflow-hidden rounded-md border border-amber/10" role="list" aria-label="Dramatic structure phases">
          {structure.segments.map((seg, i) => {
            const span = seg.endSceneIndex - seg.startSceneIndex + 1
            const widthPct = scenes.length > 0 ? (span / scenes.length) * 100 : 0
            const isClimax = seg.phase === 'CLIMAX'
            return (
              <div
                key={i}
                role="listitem"
                className={`flex items-center justify-center border-r border-midnight/40 last:border-r-0 ${
                  isClimax ? 'bg-burgundy/40' : i % 2 === 0 ? 'bg-amber/15' : 'bg-amber/8'
                }`}
                style={{ width: `${widthPct}%` }}
                title={`${PHASE_LABEL[seg.phase] ?? seg.phase} · scenes ${seg.startSceneIndex + 1}–${seg.endSceneIndex + 1} · ${seg.confidence}% confidence`}
              >
                <span className="truncate px-1 text-[9px] font-medium uppercase tracking-wide text-ivory/80">
                  {PHASE_LABEL[seg.phase] ?? seg.phase}
                </span>
              </div>
            )
          })}
        </div>
        {/* Key beats */}
        <div className="flex flex-wrap gap-2 text-[10px] text-slate">
          {structure.incitingIncidentScene >= 0 && (
            <Badge variant="outline" className="border-amber/20 bg-amber/5 text-amber/80">
              Inciting · Scene {structure.incitingIncidentScene + 1}
            </Badge>
          )}
          {structure.midpointScene >= 0 && (
            <Badge variant="outline" className="border-amber/20 bg-amber/5 text-amber/80">
              Midpoint · Scene {structure.midpointScene + 1}
            </Badge>
          )}
          {structure.climaxScene >= 0 && (
            <Badge variant="outline" className="border-burgundy/30 bg-burgundy/10 text-burgundy">
              Climax · Scene {structure.climaxScene + 1}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Narrative arcs ──────────────────────────────────────────────────────────

export function NarrativeArcsCard({ arcs }: { arcs: ApiNarrativeArc[] }) {
  return (
    <Card className="border-amber/12 surface-raised">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber/60">
          <Layers className="h-3.5 w-3.5" /> Narrative Arcs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {arcs.map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, ...spring.gentle }}
            className="flex items-center gap-3"
          >
            <Badge
              variant="outline"
              className="shrink-0 border-amber/20 bg-amber/5 text-[10px] text-amber"
            >
              {a.arcType}
            </Badge>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-midnight/40">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${a.intensity}%` }}
                transition={{ delay: i * 0.08 + 0.3, ...spring.gentle }}
                className="h-full rounded-full bg-linear-to-r from-amber/60 to-burgundy/60"
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-slate">
              {a.intensity}%
            </span>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  )
}
