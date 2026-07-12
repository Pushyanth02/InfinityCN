'use client'

/**
 * Lemniscate — Character detail panel
 * ----------------------------------------------------------------------------
 * The sticky right-hand panel shared between the cards and graph modes:
 * appearance timeline, top connections (graph mode), importance/confidence
 * meters, stats, aliases, and the "read" affordance. Extracted verbatim from
 * `characters.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { spring } from '@/lib/motion'
import { Film, Link2 } from 'lucide-react'
import type {
  CharacterData,
  NarrativeData,
  GraphData,
  Intelligence,
} from './characters-types'
import {
  asAliases,
  parseCharMeta,
  characterInText,
  roleColor,
  roleLabel,
  Meter,
} from './characters-shared'

// ─── CharacterDetailPanel (shared between cards + graph modes) ──────────────

interface DetailPanelProps {
  character: CharacterData
  narrative: NarrativeData
  /** When provided (graph mode), shows the "Top Connections" section. */
  graphData: GraphData | null
  /** Narrative-level intelligence (viewpoint/antagonist markers). */
  intelligence: Intelligence | null
  onRead: () => void
}

export function CharacterDetailPanel({
  character,
  narrative,
  graphData,
  intelligence,
  onRead,
}: DetailPanelProps) {
  const aliases = asAliases(character.aliases)
  const meta = parseCharMeta(character.metadata)
  const isViewpoint = intelligence?.viewpointId === character.id
  const sceneCount = meta.scenes.length
  const speaking = character.speakingCount ?? character.dialogueLines

  // Scenes the character appears in.
  const appearanceScenes = (narrative.scenes ?? []).filter((s) => {
    const text = (s.paragraphs ?? []).map((p) => p.text || '').join(' ')
    return characterInText(character, text)
  })

  // Top co-occurring characters (graph mode only).
  const topConnections = React.useMemo(() => {
    if (!graphData) return []
    const counts: { id: string; count: number }[] = []
    for (const [key, count] of graphData.coOccurrences) {
      const [a, b] = key.split('|')
      if (a === character.id) counts.push({ id: b, count })
      else if (b === character.id) counts.push({ id: a, count })
    }
    counts.sort((x, y) => y.count - x.count)
    const byId = new Map(narrative.characters.map((c) => [c.id, c]))
    return counts
      .slice(0, 4)
      .map((c) => ({ ...c, character: byId.get(c.id) }))
      .filter((c) => c.character)
  }, [graphData, character.id, narrative.characters])

  return (
    <Card className="sticky top-20 border-amber/15 surface-raised">
      <div className="divider-gold" />
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: roleColor(character.role) }}
          />
          <CardTitle className="font-serif text-lg text-ivory">
            {character.name}
          </CardTitle>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber/60">
            {roleLabel(character.role)}
          </span>
          {isViewpoint && (
            <Badge
              variant="outline"
              className="border-amber/30 bg-amber/10 text-[9px] uppercase tracking-wider text-amber"
            >
              Viewpoint
            </Badge>
          )}
          {meta.gender !== 'UNKNOWN' && (
            <Badge
              variant="outline"
              className="border-slate/25 bg-transparent text-[9px] uppercase tracking-wider text-slate"
            >
              {meta.gender === 'MALE' ? 'He/Him' : 'She/Her'}
            </Badge>
          )}
        </div>
        {meta.honorifics.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {meta.honorifics.map((h) => (
              <Badge
                key={h}
                variant="outline"
                className="border-amber/15 bg-amber/5 text-[10px] text-amber/70"
              >
                {h}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Appearance timeline */}
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
            Appearance Timeline
          </h4>
          <div className="relative h-12 rounded-lg bg-midnight/40">
            {appearanceScenes.map((scene, i, arr) => {
              const pct =
                arr.length > 1 ? (i / (arr.length - 1)) * 100 : 50
              return (
                <motion.div
                  key={scene.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.05, ...spring.snappy }}
                  className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-amber"
                  style={{ left: `calc(${pct}% - 4px)` }}
                  title={`Scene ${scene.index + 1}`}
                />
              )
            })}
            {appearanceScenes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate/40">
                No scene appearances detected
              </div>
            )}
            <div className="absolute bottom-1 left-2 text-[9px] text-slate/40">
              Start
            </div>
            <div className="absolute bottom-1 right-2 text-[9px] text-slate/40">
              End
            </div>
          </div>
        </div>

        {/* Top connections (graph mode only) */}
        {graphData && topConnections.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
              <Link2 className="h-3 w-3" /> Top Connections
            </h4>
            <div className="space-y-1.5">
              {topConnections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md bg-midnight/30 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: roleColor(c.character!.role) }}
                    />
                    <span className="text-xs text-ivory">
                      {c.character!.name}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-amber/70">
                    {c.count} shared
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator className="bg-amber/8" />

        {/* Importance & confidence meters */}
        <div className="space-y-2.5">
          <Meter label="Importance" value={character.importanceScore ?? 0} tone="amber" />
          <Meter label="Confidence" value={character.confidenceScore ?? 0} tone="calm" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-midnight/30 p-2.5 text-center">
            <div className="font-serif text-xl text-amber">{character.mentions}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Mentions</div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5 text-center">
            <div className="font-serif text-xl text-amber">{speaking}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Speaking</div>
          </div>
          <div className="rounded-lg bg-midnight/30 p-2.5 text-center">
            <div className="font-serif text-xl text-calm">{sceneCount}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate">Scenes</div>
          </div>
        </div>

        {aliases.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber/60">
              Also Known As
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {aliases.map((a, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="border-amber/20 bg-amber/5 text-xs text-amber/70"
                >
                  {a}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 border-amber/20 text-amber hover:bg-amber/5"
          onClick={onRead}
        >
          <Film className="h-3.5 w-3.5" /> Read in Cinematified Mode
        </Button>
      </CardContent>
    </Card>
  )
}
