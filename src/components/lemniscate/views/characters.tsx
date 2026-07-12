'use client'

/**
 * Lemniscate — Character explorer
 * ----------------------------------------------------------------------------
 * Orchestrator for the character view: fetches the narrative, toggles between
 * card and relationship-graph modes, and drives the shared detail panel. The
 * graph, detail panel, helpers, and types live in sibling `characters-*`
 * modules; each was extracted verbatim from the original monolith.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLemniscate } from '../store'
import { Flourish } from '../logo'
import { staggerContainer, revealScale, hoverLift, spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  Film,
  Crown,
  Skull,
  User,
  Sparkles,
  MessageSquare,
  Layers,
  LayoutGrid,
  Share2,
  AlertCircle,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import type { CharacterData, NarrativeData, ViewMode } from './characters-types'
import {
  asAliases,
  parseCharMeta,
  parseIntelligence,
  useGraphData,
  Meter,
} from './characters-shared'
import { RelationshipGraph } from './characters-graph'
import { CharacterDetailPanel } from './characters-detail-panel'

// ─── Card-mode role config (kept from the original view) ─────────────────────

const roleCardConfig: Record<
  string,
  { icon: LucideIcon; color: string; bg: string; label: string }
> = {
  PROTAGONIST: {
    icon: Crown,
    color: 'text-amber',
    bg: 'from-amber/15 to-amber/5 border-amber/30',
    label: 'Protagonist',
  },
  ANTAGONIST: {
    icon: Skull,
    color: 'text-burgundy',
    bg: 'from-burgundy/15 to-burgundy/5 border-burgundy/30',
    label: 'Antagonist',
  },
  SUPPORTING: {
    icon: User,
    color: 'text-calm',
    bg: 'from-calm/10 to-calm/5 border-calm/25',
    label: 'Supporting',
  },
  MINOR: {
    icon: User,
    color: 'text-slate',
    bg: 'from-slate/10 to-slate/5 border-slate/20',
    label: 'Minor',
  },
}

// ─── Main view ───────────────────────────────────────────────────────────────

export function CharactersView() {
  const narrativeId = useLemniscate((s) => s.activeNarrativeId)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openReader = useLemniscate((s) => s.openReader)
  const openScenes = useLemniscate((s) => s.openScenes)
  const [data, setData] = React.useState<NarrativeData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<CharacterData | null>(null)
  const [viewMode, setViewMode] = React.useState<ViewMode>('cards')

  const fetchData = React.useCallback(() => {
    if (!narrativeId) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/narratives/${narrativeId}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return
        setData(d.narrative)
        if (d.narrative?.characters?.length)
          setSelected(d.narrative.characters[0])
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load narrative')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [narrativeId])

  React.useEffect(() => {
    const cleanup = fetchData()
    return cleanup
  }, [fetchData])

  const characters = data?.characters ?? []
  const scenes = data?.scenes ?? []
  const graphData = useGraphData(characters, scenes)
  const intelligence = React.useMemo(() => parseIntelligence(data?.metadata), [data?.metadata])

  if (!narrativeId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Button
          variant="ghost"
          onClick={openLibrary}
          className="gap-1.5 text-slate"
        >
          <ArrowLeft className="h-4 w-4" /> Select a narrative from your library
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-10 w-48 bg-midnight/50" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 bg-midnight/50" />
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
          <h2 className="text-title text-ivory">Could not load characters</h2>
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      {/* Top nav */}
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
            onClick={() => openReader(narrativeId, 'CINEMATIFIED')}
            className="gap-1.5 border-amber/20 text-amber hover:bg-amber/5"
          >
            <Film className="h-3.5 w-3.5" /> Reader
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openScenes(narrativeId)}
            className="gap-1.5 border-amber/20 text-ivory hover:bg-amber/5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Scenes
          </Button>
        </div>
      </div>

      {/* Title + view-mode toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-headline text-ivory">Character Explorer</h1>
          <p className="text-sm text-slate">
            {data?.title} · {characters.length} characters detected
          </p>
          <Flourish className="mt-2 h-3 w-32 text-amber/30" />
        </div>

        {/* Toggle: Cards | Relationship Graph */}
        <div className="inline-flex shrink-0 rounded-lg border border-amber/15 bg-midnight/40 p-1">
          {(['cards', 'graph'] as const).map((mode) => {
            const isActive = viewMode === mode
            const Icon = mode === 'cards' ? LayoutGrid : Share2
            const fullLabel =
              mode === 'cards' ? 'Cards' : 'Relationship Graph'
            const shortLabel = mode === 'cards' ? 'Cards' : 'Graph'
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                aria-pressed={isActive}
                className={cn(
                  'relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:px-4',
                  isActive ? 'text-midnight' : 'text-slate hover:text-ivory',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="viewModePill"
                    className="absolute inset-0 rounded-md bg-amber"
                    transition={spring.snappy}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{fullLabel}</span>
                  <span className="sm:hidden">{shortLabel}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main grid: graph/cards on left, detail panel on right */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <AnimatePresence mode="wait">
          {viewMode === 'cards' ? (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={spring.gentle}
              variants={staggerContainer}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {characters.map((c) => {
                  const cfg = roleCardConfig[c.role] ?? roleCardConfig.MINOR
                  const Icon = cfg.icon
                  const isSelected = selected?.id === c.id
                  const aliases = asAliases(c.aliases)
                  return (
                    <motion.div key={c.id} variants={revealScale} {...hoverLift}>
                      <Card
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={`Select ${c.name}, ${cfg.label.toLowerCase()}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelected(c)
                          }
                        }}
                        className={`cursor-pointer border bg-linear-to-br ${cfg.bg} backdrop-blur-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50 ${
                          isSelected ? 'ring-1 ring-amber/40' : ''
                        }`}
                        onClick={() => setSelected(c)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-midnight/40 ${cfg.color}`}
                              >
                                <Icon className="h-5 w-5" />
                              </span>
                              <div>
                                <h3 className="font-serif text-base font-medium text-ivory">
                                  {c.name}
                                </h3>
                                <Badge
                                  variant="outline"
                                  className={`mt-0.5 border-none bg-transparent p-0 text-[10px] ${cfg.color}`}
                                >
                                  {cfg.label}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-serif text-lg text-ivory">
                                {c.mentions}
                              </div>
                              <div className="text-[9px] uppercase tracking-wider text-slate">
                                mentions
                              </div>
                            </div>
                          </div>
                          {aliases.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {aliases.slice(0, 3).map((a, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="border-amber/15 bg-amber/5 text-[10px] text-amber/60"
                                >
                                  {a}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="mt-3 flex items-center gap-3 text-[11px] text-slate">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />{' '}
                              {c.speakingCount ?? c.dialogueLines} speaking
                            </span>
                            <span className="text-amber/20">·</span>
                            <span className="flex items-center gap-1">
                              <Layers className="h-3 w-3" />{' '}
                              {parseCharMeta(c.metadata).scenes.length} scenes
                            </span>
                          </div>
                          <div className="mt-2.5">
                            <Meter label="Importance" value={c.importanceScore ?? 0} />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="graph"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={spring.gentle}
            >
              <RelationshipGraph
                characters={characters}
                selectedId={selected?.id ?? null}
                onSelect={(c) => setSelected(c)}
                graphData={graphData}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail panel (shared) */}
        <AnimatePresence mode="wait">
          {selected && data && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring.gentle}
            >
              <CharacterDetailPanel
                character={selected}
                narrative={data}
                graphData={viewMode === 'graph' ? graphData : null}
                intelligence={intelligence}
                onRead={() => openReader(narrativeId, 'CINEMATIFIED')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
