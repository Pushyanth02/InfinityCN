'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  Link2,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CharacterData {
  id: string
  name: string
  // Stored as JSON string in DB; tolerant of either shape.
  aliases: string[] | string
  mentions: number
  firstAppearanceOffset: number
  role: string
  dialogueLines: number
  description: string | null
  // Narrative Intelligence Engine v2 (tolerant — may be absent on old rows).
  importanceScore?: number
  confidenceScore?: number
  speakingCount?: number
  lastAppearanceOffset?: number
  /** JSON string: { id, honorifics, gender, scenes }. */
  metadata?: string
}

/** Parsed per-character metadata (honorifics, gender, scene participation). */
interface CharMeta {
  honorifics: string[]
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  scenes: number[]
}

/** Narrative-level intelligence (protagonist/antagonist/viewpoint + focus). */
interface Intelligence {
  antagonistId: string | null
  viewpointId: string | null
  narrativeFocus: number
  speakingDominance: number
  sceneParticipation: number
}

/** Minimal scene shape consumed here — id/index for the timeline, text for detection. */
interface SceneData {
  id: string
  index: number
  paragraphs?: Array<{ text?: string | null }>
}

interface NarrativeData {
  id: string
  title: string
  mode: string
  characters: CharacterData[]
  scenes: SceneData[]
  /** JSON string with intelligence/timelines (parsed lazily). */
  metadata?: string
}

type ViewMode = 'cards' | 'graph'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce the aliases field (DB JSON string OR already-parsed array) into a string[]. */
function asAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  }
  if (typeof raw === 'string') {
    if (raw === '' || raw === '[]') return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
      }
    } catch {
      /* ignore — treat as no aliases */
    }
  }
  return []
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Parse a character's metadata JSON into a tolerant CharMeta shape. */
function parseCharMeta(raw: unknown): CharMeta {
  const fallback: CharMeta = { honorifics: [], gender: 'UNKNOWN', scenes: [] }
  if (typeof raw !== 'string' || !raw || raw === '{}') return fallback
  try {
    const p = JSON.parse(raw) as Partial<CharMeta>
    return {
      honorifics: Array.isArray(p.honorifics) ? p.honorifics.filter((x): x is string => typeof x === 'string') : [],
      gender: p.gender === 'MALE' || p.gender === 'FEMALE' ? p.gender : 'UNKNOWN',
      scenes: Array.isArray(p.scenes) ? p.scenes.filter((x): x is number => typeof x === 'number') : [],
    }
  } catch {
    return fallback
  }
}

/** Parse narrative-level intelligence from Narrative.metadata JSON. */
function parseIntelligence(raw: unknown): Intelligence | null {
  if (typeof raw !== 'string' || !raw || raw === '{}') return null
  try {
    const p = JSON.parse(raw) as { intelligence?: Partial<Intelligence> }
    const i = p.intelligence
    if (!i) return null
    return {
      antagonistId: typeof i.antagonistId === 'string' ? i.antagonistId : null,
      viewpointId: typeof i.viewpointId === 'string' ? i.viewpointId : null,
      narrativeFocus: typeof i.narrativeFocus === 'number' ? i.narrativeFocus : 0,
      speakingDominance: typeof i.speakingDominance === 'number' ? i.speakingDominance : 0,
      sceneParticipation: typeof i.sceneParticipation === 'number' ? i.sceneParticipation : 0,
    }
  } catch {
    return null
  }
}

/** A small labelled meter (0..100) with an accessible progressbar role. */
function Meter({ label, value, tone = 'amber' }: { label: string; value: number; tone?: 'amber' | 'calm' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  const barColor = tone === 'calm' ? 'bg-calm' : 'bg-amber'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate">{label}</span>
        <span className="font-mono text-[10px] tabular-nums text-amber/80">{pct}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-midnight/50"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${pct} out of 100`}
      >
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** True if a character (by name or any alias) is mentioned anywhere in `text`. */
function characterInText(c: CharacterData, text: string): boolean {
  if (!text) return false
  const names = [c.name, ...asAliases(c.aliases)].filter(Boolean)
  for (const name of names) {
    // Word-ish boundary tolerant of apostrophes/hyphens inside names.
    const re = new RegExp(`(?<![\\w'])${escapeRegex(name)}(?![\\w'])`, 'i')
    if (re.test(text)) return true
  }
  return false
}

// ─── Role palette ────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { color: string; label: string }> = {
  PROTAGONIST: { color: 'var(--amber)', label: 'Protagonist' },
  ANTAGONIST: { color: 'var(--burgundy)', label: 'Antagonist' },
  SUPPORTING: { color: 'var(--calm)', label: 'Supporting' },
  MINOR: { color: 'var(--slate)', label: 'Minor' },
}

function roleColor(role: string): string {
  return ROLE_META[role]?.color ?? ROLE_META.MINOR.color
}

function roleLabel(role: string): string {
  return ROLE_META[role]?.label ?? 'Minor'
}

// ─── Graph data model ────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  name: string
  role: string
  mentions: number
  x: number
  y: number
  r: number
  color: string
  character: CharacterData
}

interface GraphEdge {
  key: string
  from: string
  to: string
  fromName: string
  toName: string
  count: number
  x1: number
  y1: number
  x2: number
  y2: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxCount: number
  scenePresence: Map<string, number>
  coOccurrences: Map<string, number> // key: `${idA}|${idB}` (sorted)
}

// ─── Graph computation ───────────────────────────────────────────────────────

/**
 * Build a deterministic co-occurrence graph from the narrative's characters
 * and scenes. Layout is a simple circle (equal angular spacing).
 */
function useGraphData(characters: CharacterData[], scenes: SceneData[]): GraphData {
  return React.useMemo(() => {
    if (!characters.length || !scenes.length) {
      return {
        nodes: [],
        edges: [],
        maxCount: 0,
        scenePresence: new Map<string, number>(),
        coOccurrences: new Map<string, number>(),
      }
    }

    // 1. Per-scene character presence (any character mentioned in that scene's text).
    const sceneChars: Set<string>[] = scenes.map((scene) => {
      const text = (scene.paragraphs ?? [])
        .map((p) => p.text || '')
        .join(' ')
      return new Set(
        characters.filter((c) => characterInText(c, text)).map((c) => c.id),
      )
    })

    // 2. Per-character scene count (for reference / sizing).
    const scenePresence = new Map<string, number>()
    for (const c of characters) scenePresence.set(c.id, 0)
    for (const set of sceneChars) {
      for (const id of set) {
        scenePresence.set(id, (scenePresence.get(id) ?? 0) + 1)
      }
    }

    // 3. Co-occurrence matrix: for each pair (A, B), count scenes where both appear.
    const coOccurrences = new Map<string, number>()
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
    for (const set of sceneChars) {
      const ids = [...set]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = pairKey(ids[i], ids[j])
          coOccurrences.set(key, (coOccurrences.get(key) ?? 0) + 1)
        }
      }
    }
    let maxCount = 0
    for (const v of coOccurrences.values()) if (v > maxCount) maxCount = v

    // 4. Circular layout (deterministic, no physics engine).
    const W = 800
    const H = 500
    const cx = W / 2
    const cy = H / 2
    const n = characters.length
    const baseR = Math.min(W, H) / 2 - 70 // ≈ 180, leaves room for labels
    const layoutR = n === 1 ? 0 : baseR

    const byId = new Map(characters.map((c) => [c.id, c]))
    const nodes: GraphNode[] = characters.map((c, i) => {
      const angle = n === 1 ? 0 : (i / n) * Math.PI * 2 - Math.PI / 2 // start at top
      const x = cx + Math.cos(angle) * layoutR
      const y = cy + Math.sin(angle) * layoutR
      // Radius: 10 + sqrt(mentions) * 3, capped to avoid dwarfing the layout.
      const r = Math.min(40, 10 + Math.sqrt(Math.max(0, c.mentions)) * 3)
      return {
        id: c.id,
        name: c.name,
        role: c.role,
        mentions: c.mentions,
        x,
        y,
        r,
        color: roleColor(c.role),
        character: c,
      }
    })
    const pos = new Map(nodes.map((nn) => [nn.id, { x: nn.x, y: nn.y }]))

    // 5. Build edges (only count ≥ 1). Sort ascending so thicker lines draw on top.
    const edges: GraphEdge[] = []
    for (const [key, count] of coOccurrences) {
      if (count < 1) continue
      const [a, b] = key.split('|')
      const pa = pos.get(a)
      const pb = pos.get(b)
      if (!pa || !pb) continue
      const ca = byId.get(a)
      const cb = byId.get(b)
      edges.push({
        key,
        from: a,
        to: b,
        fromName: ca?.name ?? a,
        toName: cb?.name ?? b,
        count,
        x1: pa.x,
        y1: pa.y,
        x2: pb.x,
        y2: pb.y,
      })
    }
    edges.sort((a, b) => a.count - b.count)

    return { nodes, edges, maxCount, scenePresence, coOccurrences }
  }, [characters, scenes])
}

// ─── RelationshipGraph component ─────────────────────────────────────────────

interface RelationshipGraphProps {
  characters: CharacterData[]
  selectedId: string | null
  onSelect: (c: CharacterData) => void
  graphData: GraphData
}

function RelationshipGraph({
  characters,
  selectedId,
  onSelect,
  graphData,
}: RelationshipGraphProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const { nodes, edges, maxCount } = graphData

  // Deterministic decorative stars (seeded Mulberry32 PRNG).
  const stars = React.useMemo(() => {
    let seed = 0x1337c0de
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const out: { x: number; y: number; r: number; o: number }[] = []
    for (let i = 0; i < 70; i++) {
      out.push({
        x: rand() * 800,
        y: rand() * 500,
        r: rand() * 1.1 + 0.25,
        o: rand() * 0.35 + 0.08,
      })
    }
    return out
  }, [])

  // IDs connected to the hovered node (for highlight + dim logic).
  const connectedIds = React.useMemo(() => {
    if (!hoveredId) return null
    const set = new Set<string>([hoveredId])
    for (const e of edges) {
      if (e.from === hoveredId) set.add(e.to)
      else if (e.to === hoveredId) set.add(e.from)
    }
    return set
  }, [hoveredId, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-[500px] items-center justify-center rounded-xl border border-amber/10 bg-midnight/30">
        <p className="text-sm text-slate">No characters to graph.</p>
      </div>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-amber/10 bg-midnight/40"
      role="img"
      aria-label="Character relationship constellation — nodes are characters, edges connect characters that share scenes"
    >
      {/* Header overlay */}
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber/50">
          Constellation Map
        </p>
        <p className="mt-0.5 font-serif text-sm text-ivory/80">
          {nodes.length} characters · {edges.length} connections
        </p>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 z-10 text-right">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate/60">
          Hover · trace · click
        </p>
      </div>

      <svg
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid meet"
        className="block h-[440px] w-full sm:h-[500px]"
      >
        <defs>
          <radialGradient id="graphCosmos" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--plum)" stopOpacity="0.55" />
            <stop offset="60%" stopColor="var(--midnight)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--midnight)" stopOpacity="0" />
          </radialGradient>
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Cosmic backdrop */}
        <rect x="0" y="0" width="800" height="500" fill="url(#graphCosmos)" />

        {/* Faint background stars */}
        <g aria-hidden="true">
          {stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="var(--ivory)"
              opacity={s.o}
            />
          ))}
        </g>

        {/* Edges (drawn before nodes so they sit beneath them) */}
        <g>
          {edges.map((e, idx) => {
            const isHighlighted =
              hoveredId === e.from || hoveredId === e.to
            const isDimmed = !!hoveredId && !isHighlighted
            const baseOpacity =
              maxCount > 0 ? 0.2 + (e.count / maxCount) * 0.6 : 0.3
            const targetOpacity = isDimmed
              ? 0.04
              : isHighlighted
                ? Math.max(0.9, baseOpacity)
                : baseOpacity
            const stroke = isHighlighted ? 'var(--amber)' : 'var(--ivory)'
            const strokeWidth = Math.min(6, 1 + e.count * 0.5)
            const d = `M ${e.x1} ${e.y1} L ${e.x2} ${e.y2}`
            return (
              <motion.path
                key={e.key}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeOpacity={targetOpacity}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: {
                    delay: 0.5 + idx * 0.012,
                    duration: 0.5,
                    ease: 'easeOut',
                  },
                  opacity: { duration: 0.2 },
                }}
                style={{ pointerEvents: 'none' }}
              >
                <title>
                  {e.fromName} ↔ {e.toName} · {e.count} shared scene
                  {e.count === 1 ? '' : 's'}
                </title>
              </motion.path>
            )
          })}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((n, i) => {
            const isHovered = hoveredId === n.id
            const isSelected = selectedId === n.id
            const dimmed = !!hoveredId && !connectedIds?.has(n.id)
            const haloOpacity = isHovered
              ? 0.32
              : isSelected
                ? 0.22
                : dimmed
                  ? 0.05
                  : 0.14
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <motion.g
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: dimmed ? 0.25 : 1,
                    scale: isHovered ? 1.15 : isSelected ? 1.08 : 1,
                  }}
                  transition={{
                    delay: 0.1 + i * 0.04,
                    type: 'spring',
                    stiffness: 280,
                    damping: 22,
                  }}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onSelect(n.character)}
                >
                  {/* Outer halo (glow) */}
                  <circle
                    cx={0}
                    cy={0}
                    r={n.r + 8}
                    fill={n.color}
                    opacity={haloOpacity}
                    filter="url(#nodeGlow)"
                  />
                  {/* Selected dashed ring */}
                  {isSelected && (
                    <circle
                      cx={0}
                      cy={0}
                      r={n.r + 5}
                      fill="none"
                      stroke="var(--amber)"
                      strokeWidth={1}
                      strokeOpacity={0.55}
                      strokeDasharray="3 2.5"
                    />
                  )}
                  {/* Main node */}
                  <circle
                    cx={0}
                    cy={0}
                    r={n.r}
                    fill={n.color}
                    stroke="var(--midnight)"
                    strokeWidth={1.5}
                  />
                  {/* Inner sheen for sphere feel */}
                  <circle
                    cx={-n.r * 0.25}
                    cy={-n.r * 0.25}
                    r={n.r * 0.35}
                    fill="var(--ivory)"
                    opacity={0.18}
                  />
                  {/* Label (with dark halo for legibility over edges) */}
                  <text
                    x={0}
                    y={n.r + 16}
                    textAnchor="middle"
                    fill="var(--ivory)"
                    fontSize="11"
                    fontFamily="var(--font-serif-display)"
                    fontWeight="500"
                    stroke="var(--midnight)"
                    strokeWidth="3"
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none' }}
                  >
                    {n.name}
                  </text>
                  {/* Mention count */}
                  <text
                    x={0}
                    y={n.r + 28}
                    textAnchor="middle"
                    fill="var(--amber)"
                    fontSize="9"
                    fontFamily="var(--font-mono-stack)"
                    opacity={0.7}
                    style={{ pointerEvents: 'none' }}
                  >
                    {n.mentions} mentions
                  </text>
                  {/* Invisible larger hit area */}
                  <circle
                    cx={0}
                    cy={0}
                    r={Math.max(n.r + 12, 26)}
                    fill="transparent"
                    style={{ pointerEvents: 'all' }}
                  />
                  <title>
                    {n.name} · {roleLabel(n.role)} · {n.mentions} mentions
                  </title>
                </motion.g>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-amber/8 px-4 py-3">
        {Object.entries(ROLE_META).map(([role, meta]) => {
          const count = characters.filter((c) => c.role === role).length
          if (count === 0) return null
          return (
            <div key={role} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate">
                {meta.label}
              </span>
              <span className="text-[10px] text-slate/50">{count}</span>
            </div>
          )
        })}
        <div className="flex items-center gap-1.5 pl-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate/60">
            Node size
          </span>
          <span className="text-[10px] text-slate/50">= mentions</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate/60">
            Edge weight
          </span>
          <span className="text-[10px] text-slate/50">= shared scenes</span>
        </div>
      </div>
    </div>
  )
}

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

function CharacterDetailPanel({
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
  const [data, setData] = React.useState<NarrativeData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<CharacterData | null>(null)
  const [viewMode, setViewMode] = React.useState<ViewMode>('cards')

  React.useEffect(() => {
    if (!narrativeId) return
    let cancelled = false
    const controller = new AbortController()
    let loadingTimer: ReturnType<typeof setTimeout> | null = null
    loadingTimer = setTimeout(() => {
      if (!cancelled) setLoading(true)
    }, 0)
    fetch(`/api/narratives/${narrativeId}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then((d) => {
        if (!cancelled) {
          setData(d.narrative)
          if (d.narrative?.characters?.length)
            setSelected(d.narrative.characters[0])
        }
      })
      .catch(() => {})
      .finally(() => {
        if (loadingTimer) clearTimeout(loadingTimer)
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      if (loadingTimer) clearTimeout(loadingTimer)
      controller.abort()
    }
  }, [narrativeId])

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
            onClick={() => useLemniscate.getState().openScenes(narrativeId)}
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
                        className={`cursor-pointer border bg-linear-to-br ${cfg.bg} backdrop-blur-sm transition-all ${
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
