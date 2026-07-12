'use client'

/**
 * Lemniscate — Scene explorer
 * ----------------------------------------------------------------------------
 * Orchestrator for the scene view: fetches the narrative, handles loading and
 * error states, computes the timeline maxima/averages, and composes the
 * visualization components. The timelines, structure/arc cards, scene card,
 * and detail panel live in sibling `scenes-*` modules; their markup was
 * extracted verbatim from the original monolith.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLemniscate } from '../store'
import { Flourish } from '../logo'
import { staggerContainer, spring } from '@/lib/motion'
import { apiFetch } from '@/lib/api/client'
import {
  ArrowLeft,
  Film,
  Sparkles,
  Layers,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'

import type { ApiScene } from '@/lib/types'
import { type NarrativeData, parseStructure } from './scenes-shared'
import {
  TensionTimeline,
  MomentumTimeline,
  EmotionalTimeline,
} from './scenes-timelines'
import { StoryStructureCard, NarrativeArcsCard } from './scenes-structure'
import { SceneCard } from './scenes-scene-card'
import { SceneDetailPanel } from './scenes-detail-panel'

export function ScenesView() {
  const narrativeId = useLemniscate((s) => s.activeNarrativeId)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openReader = useLemniscate((s) => s.openReader)
  const openCharacters = useLemniscate((s) => s.openCharacters)
  const [data, setData] = React.useState<NarrativeData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<ApiScene | null>(null)

  const fetchData = React.useCallback(() => {
    if (!narrativeId) return
    setLoading(true)
    setError(null)
    // v1 narrative detail → { data: { narrative, pagination } }; apiFetch
    // unwraps to that object, so we read `.narrative` off the result.
    apiFetch<{ narrative: NarrativeData }>(`/api/v1/narratives/${narrativeId}`)
      .then((data) => {
        const narrative = data.narrative
        setData(narrative)
        setError(null)
        if (narrative?.scenes?.length) setSelected(narrative.scenes[0])
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
            onClick={() => openCharacters(narrativeId)}
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
          <TensionTimeline
            scenes={scenes}
            selected={selected}
            onSelect={setSelected}
            maxTension={maxTension}
          />

          {/* Momentum timeline */}
          <MomentumTimeline
            scenes={scenes}
            selected={selected}
            onSelect={setSelected}
            maxMomentum={maxMomentum}
            avgMomentum={avgMomentum}
          />

          {/* Emotional timeline (valence above/below the neutral line) */}
          <EmotionalTimeline
            scenes={scenes}
            selected={selected}
            onSelect={setSelected}
            maxAbsValence={maxAbsValence}
          />

          {/* Story structure */}
          {structure && structure.segments.length > 0 && (
            <StoryStructureCard structure={structure} scenes={scenes} />
          )}

          {/* Arc map */}
          {arcs.length > 0 && <NarrativeArcsCard arcs={arcs} />}

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            {/* Scene list */}
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid gap-3 md:grid-cols-2"
            >
              {scenes.map((s) => (
                <SceneCard
                  key={s.id}
                  scene={s}
                  isSelected={selected?.id === s.id}
                  onSelect={setSelected}
                />
              ))}
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
                  <SceneDetailPanel
                    scene={selected}
                    onRead={() => openReader(narrativeId, 'CINEMATIFIED')}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
