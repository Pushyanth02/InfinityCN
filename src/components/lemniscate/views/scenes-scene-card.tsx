'use client'

/**
 * Lemniscate — Scene explorer scene card
 * ----------------------------------------------------------------------------
 * A single selectable scene tile in the scene-list grid. Prop-driven; markup
 * extracted verbatim from `scenes.tsx` and behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { revealUp } from '@/lib/motion'
import { Waves } from 'lucide-react'
import type { ApiScene } from '@/lib/types'
import { buildSceneHeading } from './scenes-shared'

export function SceneCard({
  scene,
  isSelected,
  onSelect,
}: {
  scene: ApiScene
  isSelected: boolean
  onSelect: (s: ApiScene) => void
}) {
  return (
    <motion.div variants={revealUp}>
      <Card
        className={`cursor-pointer border transition-all ${
          isSelected
            ? 'border-amber/40 bg-amber/5 ring-1 ring-amber/20'
            : 'border-amber/10 bg-card/40 hover:border-amber/25 hover:bg-card/60'
        }`}
        onClick={() => onSelect(scene)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="font-serif text-sm font-medium text-ivory">
                Scene {scene.index + 1}
              </h4>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-amber/50">
                {buildSceneHeading(scene)}
              </p>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 border-none bg-transparent p-0 text-[10px] ${
                (scene.tensionScore || 0) > 60
                  ? 'text-burgundy'
                  : (scene.tensionScore || 0) > 30
                    ? 'text-amber'
                    : 'text-calm'
              }`}
            >
              {scene.mood || '—'}
            </Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-slate">{scene.summary}</p>
          <Separator className="my-2.5 bg-amber/8" />
          <div className="flex items-center gap-2 text-[10px] text-slate">
            <span className="flex items-center gap-0.5">
              <Waves className="h-2.5 w-2.5" /> {scene.tensionScore}%
            </span>
            <span className="text-amber/15">·</span>
            <span>{scene.eventCount} events</span>
            <span className="text-amber/15">·</span>
            <span>{Math.round((scene.dialogueRatio || 0) * 100)}% dialogue</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
