'use client'

/**
 * Lemniscate — Scene explorer detail panel
 * ----------------------------------------------------------------------------
 * The sticky right-hand panel for the selected scene: metrics, location/time,
 * events, and the "read this scene" affordance. Prop-driven; markup extracted
 * verbatim from `scenes.tsx` and behavior is unchanged. The animated wrapper
 * (AnimatePresence + motion) stays in the parent so entry/exit is preserved.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Film, Clock, MapPin } from 'lucide-react'
import type { ApiScene } from '@/lib/types'
import { buildSceneHeading, PHASE_LABEL } from './scenes-shared'

export function SceneDetailPanel({
  scene,
  onRead,
}: {
  scene: ApiScene
  onRead: () => void
}) {
  return (
    <Card className="sticky top-20 border-amber/15 surface-raised">
      <div className="divider-gold" />
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg text-ivory">
          Scene {scene.index + 1}
        </CardTitle>
        <p className="font-mono text-[10px] uppercase tracking-wide text-amber/50">
          {buildSceneHeading(scene)}
        </p>
        {scene.structurePhase && (
          <Badge
            variant="outline"
            className="mt-1 w-fit border-amber/25 bg-amber/5 text-[9px] uppercase tracking-wider text-amber/80"
          >
            {PHASE_LABEL[scene.structurePhase] ?? scene.structurePhase}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {scene.summary && (
          <p className="border-l-2 border-amber/25 pl-3 text-xs italic text-slate">
            {scene.summary}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div
              className={`font-serif text-xl ${
                (scene.tensionScore || 0) > 60
                  ? 'text-burgundy'
                  : (scene.tensionScore || 0) > 30
                    ? 'text-amber'
                    : 'text-calm'
              }`}
            >
              {scene.tensionScore}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate">
              Tension
            </div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div className="font-serif text-xl text-amber">
              {scene.eventCount}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate">
              Events
            </div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div className="font-serif text-xl text-calm">
              {Math.round((scene.dialogueRatio || 0) * 100)}%
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate">
              Dialogue
            </div>
          </div>
        </div>

        {/* v2 metrics */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div className="font-serif text-xl text-calm">{scene.momentumScore ?? 0}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Momentum</div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div className="font-serif text-xl text-amber">{scene.arousalScore ?? 0}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Arousal</div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5">
            <div
              className={`font-serif text-xl ${
                (scene.valence ?? 0) >= 0 ? 'text-amber' : 'text-burgundy'
              }`}
            >
              {scene.valence ?? 0}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Valence</div>
          </div>
        </div>

        {scene.location && (
          <div className="flex items-center gap-1.5 text-xs text-slate">
            <MapPin className="h-3 w-3 text-amber/60" /> {scene.location}
          </div>
        )}
        {scene.timeOfDay && (
          <div className="flex items-center gap-1.5 text-xs text-slate">
            <Clock className="h-3 w-3 text-amber/60" />{' '}
            {scene.timeOfDay.toLowerCase()}
          </div>
        )}

        {scene.events && scene.events.length > 0 && (
          <div>
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
              Events in this scene
            </h4>
            <ScrollArea className="h-32 scrollbar-lemniscate">
              <div className="space-y-1.5">
                {scene.events.slice(0, 12).map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-[11px]"
                  >
                    <Badge
                      variant="outline"
                      className="shrink-0 border-amber/15 bg-amber/5 text-[9px] text-amber/60"
                    >
                      {e.type}
                    </Badge>
                    <span className="text-slate">
                      {e.description?.slice(0, 60)}…
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 border-amber/20 text-amber hover:bg-amber/5"
          onClick={onRead}
        >
          <Film className="h-3.5 w-3.5" /> Read this scene
        </Button>
      </CardContent>
    </Card>
  )
}
