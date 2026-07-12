'use client'

/**
 * Lemniscate — Character explorer shared helpers
 * ----------------------------------------------------------------------------
 * Tolerant JSON parsers, character-in-text detection, the role palette, the
 * small labelled meter, and the deterministic co-occurrence graph computation.
 * Extracted verbatim from `characters.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import type {
  CharacterData,
  CharMeta,
  Intelligence,
  SceneData,
  GraphNode,
  GraphEdge,
  GraphData,
} from './characters-types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce the aliases field (DB JSON string OR already-parsed array) into a string[]. */
export function asAliases(raw: unknown): string[] {
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
export function parseCharMeta(raw: unknown): CharMeta {
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
export function parseIntelligence(raw: unknown): Intelligence | null {
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
export function Meter({ label, value, tone = 'amber' }: { label: string; value: number; tone?: 'amber' | 'calm' }) {
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
export function characterInText(c: CharacterData, text: string): boolean {
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

export const ROLE_META: Record<string, { color: string; label: string }> = {
  PROTAGONIST: { color: 'var(--amber)', label: 'Protagonist' },
  ANTAGONIST: { color: 'var(--burgundy)', label: 'Antagonist' },
  SUPPORTING: { color: 'var(--calm)', label: 'Supporting' },
  MINOR: { color: 'var(--slate)', label: 'Minor' },
}

export function roleColor(role: string): string {
  return ROLE_META[role]?.color ?? ROLE_META.MINOR.color
}

export function roleLabel(role: string): string {
  return ROLE_META[role]?.label ?? 'Minor'
}

// ─── Graph computation ───────────────────────────────────────────────────────

/**
 * Build a deterministic co-occurrence graph from the narrative's characters
 * and scenes. Layout is a simple circle (equal angular spacing).
 */
export function useGraphData(characters: CharacterData[], scenes: SceneData[]): GraphData {
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
