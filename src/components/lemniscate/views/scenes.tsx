'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useLemniscate } from '../store'
import { Flourish } from '../logo'
import { staggerContainer, revealUp, spring } from '@/lib/motion'
import {
  ArrowLeft,
  Film,
  Sparkles,
  Clock,
  Waves,
  Activity,
  Layers,
  MapPin,
  AlertCircle,
  RotateCcw,
  TrendingUp,
  Heart,
  Milestone,
} from 'lucide-react'

import type { ApiScene, ApiNarrativeArc, ApiStoryStructure } from '@/lib/types'

interface NarrativeData {
  id: string
  title: string
  mode: string
  scenes: ApiScene[]
  arcs: ApiNarrativeArc[]
  /** JSON string with intelligence/timelines/structure. */
  metadata?: string
}

/** Parse the persisted story structure from Narrative.metadata JSON. */
function parseStructure(raw: unknown): ApiStoryStructure | null {
  if (typeof raw !== 'string' || !raw || raw === '{}') return null
  try {
    const p = JSON.parse(raw) as { structure?: ApiStoryStructure }
    return p.structure && Array.isArray(p.structure.segments) ? p.structure : null
  } catch {
    return null
  }
}

/** Human-readable label for a structural phase. */
const PHASE_LABEL: Record<string, string> = {
  EXPOSITION: 'Exposition',
  INCITING_INCIDENT: 'Inciting Incident',
  RISING_ACTION: 'Rising Action',
  MIDPOINT: 'Midpoint',
  CLIMAX: 'Climax',
  FALLING_ACTION: 'Falling Action',
  RESOLUTION: 'Resolution',
}

/** Build an INT./EXT. LOCATION — TIME heading from scene fields (not persisted in DB). */
function buildSceneHeading(scene: Pick<ApiScene, 'location' | 'timeOfDay'>): string {
  const loc = scene.location?.trim()
  const locText = loc ? loc.toUpperCase() : 'UNKNOWN LOCATION'
  const tod = scene.timeOfDay || 'CONTINUOUS'
  return `${locText} — ${tod}`
}

export function ScenesView() {
  const narrativeId = useLemniscate((s) => s.activeNarrativeId)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openReader = useLemniscate((s) => s.openReader)
  const [data, setData] = React.useState<NarrativeData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<ApiScene | null>(null)

  const fetchData = React.useCallback(() => {
    if (!narrativeId) return
    setLoading(true)
    setError(null)
    fetch(`/api/narratives/${narrativeId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setData(d.narrative)
        setError(null)
        if (d.narrative?.scenes?.length) setSelected(d.narrative.scenes[0])
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load narrative')
      })
      .finally(() => setLoading(false))
  }, [narrativeId])

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  if (!narrativeId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Button variant="ghost" onClick={openLibrary} className="gap-1.5 text-slate">
          <ArrowLeft className="h-4 w-4" /> Select a narrative from your library
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-48 bg-midnight/50" />
        <Skeleton className="h-32 w-full bg-midnight/50" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 bg-midnight/50" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <Card className="surface-raised border-tension/20 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-tension/30 bg-tension/10 text-tension">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-title text-ivory">Could not load scenes</h2>
          <p className="mt-2 text-sm text-slate">
            {error || 'The narrative data could not be loaded. It may have been removed.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={fetchData}
              className="bg-amber text-midnight hover:bg-amber/90"
            >
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
            <Button
              variant="outline"
              onClick={openLibrary}
              className="border-amber/30 text-amber hover:bg-amber/10"
            >
              <ArrowLeft className="h-4 w-4" /> Library
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const scenes = data.scenes
  const arcs = data.arcs ?? []
  const structure = parseStructure(data.metadata)
  const maxTension = Math.max(100, ...scenes.map((s) => s.tensionScore || 0))
  const maxMomentum = Math.max(1, ...scenes.map((s) => s.momentumScore || 0))
  const maxAbsValence = Math.max(1, ...scenes.map((s) => Math.abs(s.valence || 0)))
  const avgTension =
    scenes.length > 0
      ? Math.round(scenes.reduce((a, s) => a + (s.tensionScore || 0), 0) / scenes.length)
      : 0
  const avgMomentum =
    scenes.length > 0
      ? Math.round(scenes.reduce((a, s) => a + (s.momentumScore || 0), 0) / scenes.length)
      : 0

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={openLibrary}
          className="gap-1.5 text-slate hover:text-amber"
        >
          <ArrowLeft className="h-4 w-4" /> Library
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => useLemniscate.getState().openCharacters(narrativeId)}
            className="gap-1.5 border-amber/20 text-ivory hover:bg-amber/5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Characters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openReader(narrativeId, 'CINEMATIFIED')}
            className="gap-1.5 border-amber/20 text-amber hover:bg-amber/5"
          >
            <Film className="h-3.5 w-3.5" /> Reader
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-headline text-ivory">Scene Explorer</h1>
        <p className="text-sm text-slate">
          {data.title} · {scenes.length} scenes · avg tension {avgTension}%
        </p>
        <Flourish className="mt-2 h-3 w-32 text-amber/30" />
      </div>

      {scenes.length === 0 ? (
        <Card className="surface-raised border-amber/12 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber/20 bg-amber/5 text-amber/50">
            <Layers className="h-6 w-6" />
          </div>
          <h2 className="text-title text-ivory">No scenes detected</h2>
          <p className="mt-2 text-sm text-slate">
            This narrative does not contain any detected scenes. This can happen with
            very short documents or documents that the pipeline could not segment.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5 border-amber/30 text-amber hover:bg-amber/10"
            onClick={() => openReader(narrativeId, 'ORIGINAL')}
          >
            <Film className="h-3.5 w-3.5" /> Read in Original Mode
          </Button>
        </Card>
      ) : (
        <>
          {/* Tension timeline */}
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
                      onClick={() => setSelected(s)}
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

          {/* Momentum timeline */}
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
                      onClick={() => setSelected(s)}
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

          {/* Emotional timeline (valence above/below the neutral line) */}
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
                      onClick={() => setSelected(s)}
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

          {/* Story structure */}
          {structure && structure.segments.length > 0 && (
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
          )}

          {/* Arc map */}
          {arcs.length > 0 && (
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
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            {/* Scene list */}
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid gap-3 md:grid-cols-2"
            >
              {scenes.map((s) => {
                const isSelected = selected?.id === s.id
                return (
                  <motion.div key={s.id} variants={revealUp}>
                    <Card
                      className={`cursor-pointer border transition-all ${
                        isSelected
                          ? 'border-amber/40 bg-amber/5 ring-1 ring-amber/20'
                          : 'border-amber/10 bg-card/40 hover:border-amber/25 hover:bg-card/60'
                      }`}
                      onClick={() => setSelected(s)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="font-serif text-sm font-medium text-ivory">
                              Scene {s.index + 1}
                            </h4>
                            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-amber/50">
                              {buildSceneHeading(s)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`shrink-0 border-none bg-transparent p-0 text-[10px] ${
                              (s.tensionScore || 0) > 60
                                ? 'text-burgundy'
                                : (s.tensionScore || 0) > 30
                                  ? 'text-amber'
                                  : 'text-calm'
                            }`}
                          >
                            {s.mood || '—'}
                          </Badge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs text-slate">{s.summary}</p>
                        <Separator className="my-2.5 bg-amber/8" />
                        <div className="flex items-center gap-2 text-[10px] text-slate">
                          <span className="flex items-center gap-0.5">
                            <Waves className="h-2.5 w-2.5" /> {s.tensionScore}%
                          </span>
                          <span className="text-amber/15">·</span>
                          <span>{s.eventCount} events</span>
                          <span className="text-amber/15">·</span>
                          <span>{Math.round((s.dialogueRatio || 0) * 100)}% dialogue</span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </motion.div>

            {/* Detail panel */}
            <AnimatePresence mode="wait">
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={spring.gentle}
                >
                  <Card className="sticky top-20 border-amber/15 surface-raised">
                    <div className="divider-gold" />
                    <CardHeader className="pb-3">
                      <CardTitle className="font-serif text-lg text-ivory">
                        Scene {selected.index + 1}
                      </CardTitle>
                      <p className="font-mono text-[10px] uppercase tracking-wide text-amber/50">
                        {buildSceneHeading(selected)}
                      </p>
                      {selected.structurePhase && (
                        <Badge
                          variant="outline"
                          className="mt-1 w-fit border-amber/25 bg-amber/5 text-[9px] uppercase tracking-wider text-amber/80"
                        >
                          {PHASE_LABEL[selected.structurePhase] ?? selected.structurePhase}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selected.summary && (
                        <p className="border-l-2 border-amber/25 pl-3 text-xs italic text-slate">
                          {selected.summary}
                        </p>
                      )}

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div
                            className={`font-serif text-xl ${
                              (selected.tensionScore || 0) > 60
                                ? 'text-burgundy'
                                : (selected.tensionScore || 0) > 30
                                  ? 'text-amber'
                                  : 'text-calm'
                            }`}
                          >
                            {selected.tensionScore}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">
                            Tension
                          </div>
                        </div>
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div className="font-serif text-xl text-amber">
                            {selected.eventCount}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">
                            Events
                          </div>
                        </div>
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div className="font-serif text-xl text-calm">
                            {Math.round((selected.dialogueRatio || 0) * 100)}%
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">
                            Dialogue
                          </div>
                        </div>
                      </div>

                      {/* v2 metrics */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div className="font-serif text-xl text-calm">{selected.momentumScore ?? 0}</div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">Momentum</div>
                        </div>
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div className="font-serif text-xl text-amber">{selected.arousalScore ?? 0}</div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">Arousal</div>
                        </div>
                        <div className="rounded-lg bg-midnight/30 p-2.5">
                          <div
                            className={`font-serif text-xl ${
                              (selected.valence ?? 0) >= 0 ? 'text-amber' : 'text-burgundy'
                            }`}
                          >
                            {selected.valence ?? 0}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-slate">Valence</div>
                        </div>
                      </div>

                      {selected.location && (
                        <div className="flex items-center gap-1.5 text-xs text-slate">
                          <MapPin className="h-3 w-3 text-amber/60" /> {selected.location}
                        </div>
                      )}
                      {selected.timeOfDay && (
                        <div className="flex items-center gap-1.5 text-xs text-slate">
                          <Clock className="h-3 w-3 text-amber/60" />{' '}
                          {selected.timeOfDay.toLowerCase()}
                        </div>
                      )}

                      {selected.events && selected.events.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
                            Events in this scene
                          </h4>
                          <ScrollArea className="h-32 scrollbar-lemniscate">
                            <div className="space-y-1.5">
                              {selected.events.slice(0, 12).map((e, i) => (
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
                        onClick={() => openReader(narrativeId, 'CINEMATIFIED')}
                      >
                        <Film className="h-3.5 w-3.5" /> Read this scene
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}