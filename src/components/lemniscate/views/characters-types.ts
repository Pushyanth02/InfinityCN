/**
 * Lemniscate — Character explorer types
 * ----------------------------------------------------------------------------
 * The character view's domain model plus the derived co-occurrence graph
 * shapes, shared between `characters.tsx` and its extracted sub-components.
 * Kept standalone so components can be split out without circular imports.
 */

// ─── Domain model ─────────────────────────────────────────────────────────────

export interface CharacterData {
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
export interface CharMeta {
  honorifics: string[]
  gender: 'MALE' | 'FEMALE' | 'UNKNOWN'
  scenes: number[]
}

/** Narrative-level intelligence (protagonist/antagonist/viewpoint + focus). */
export interface Intelligence {
  antagonistId: string | null
  viewpointId: string | null
  narrativeFocus: number
  speakingDominance: number
  sceneParticipation: number
}

/** Minimal scene shape consumed here — id/index for the timeline, text for detection. */
export interface SceneData {
  id: string
  index: number
  paragraphs?: Array<{ text?: string | null }>
}

export interface NarrativeData {
  id: string
  title: string
  mode: string
  characters: CharacterData[]
  scenes: SceneData[]
  /** JSON string with intelligence/timelines (parsed lazily). */
  metadata?: string
}

export type ViewMode = 'cards' | 'graph'

// ─── Graph data model ────────────────────────────────────────────────────────

export interface GraphNode {
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

export interface GraphEdge {
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

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxCount: number
  scenePresence: Map<string, number>
  coOccurrences: Map<string, number> // key: `${idA}|${idB}` (sorted)
}
