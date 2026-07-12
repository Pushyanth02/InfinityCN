'use client'

/**
 * Lemniscate — Character relationship graph
 * ----------------------------------------------------------------------------
 * The constellation-map SVG: nodes are characters (sized by mentions), edges
 * connect characters that share scenes (weighted by shared-scene count), with
 * hover tracing and a role legend. Extracted verbatim from `characters.tsx`;
 * behavior is unchanged.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import type { CharacterData, GraphData } from './characters-types'
import { ROLE_META, roleLabel } from './characters-shared'

// ─── RelationshipGraph component ─────────────────────────────────────────────

interface RelationshipGraphProps {
  characters: CharacterData[]
  selectedId: string | null
  onSelect: (c: CharacterData) => void
  graphData: GraphData
}

export function RelationshipGraph({
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
