/**
 * Lemniscate — Shared reader types
 * ----------------------------------------------------------------------------
 * The reader's domain model, shared between `reader.tsx` and its extracted
 * sub-components. Kept in a standalone module so components can be split out of
 * the reader monolith without circular imports.
 */
import type { ReaderMode } from '../store'

export type ParagraphType =
  | 'NARRATION'
  | 'DIALOGUE'
  | 'ACTION'
  | 'TRANSITION'
  | 'HEADING'
  | 'THOUGHT'

export interface ReaderParagraph {
  id: string
  index: number
  text: string
  type: ParagraphType
  speaker?: string | null
  wordCount: number
}

export interface ReaderEvent {
  id: string
  index: number
  type: string
  description: string
  participants?: string
  intensity?: number
}

export interface ReaderScene {
  id: string
  index: number
  title: string
  summary: string
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  tensionScore: number
  emotionScore: number
  dominantEmotion?: string | null
  // v2 promoted scalars (served on the Scene row; undeclared before)
  momentumScore?: number
  arousalScore?: number
  valence?: number
  structurePhase?: string | null
  dialogueRatio: number
  eventCount: number
  startOffset?: number
  endOffset?: number
  paragraphs: ReaderParagraph[]
  events: ReaderEvent[]
}

export interface ReaderCharacter {
  id: string
  name: string
  role: string
  mentions: number
  dialogueLines: number
  // v2 promoted scalars + JSON metadata (served; undeclared before)
  aliases?: string // JSON array
  importanceScore?: number
  confidenceScore?: number
  speakingCount?: number
  firstAppearanceOffset?: number
  lastAppearanceOffset?: number
  metadata?: string // JSON: { honorifics, gender, scenes }
}

export interface ReaderLocation {
  id: string
  name: string
  type: string
  mentions: number
}

/** Narrative arc (served as NarrativeArc[]). */
export interface ReaderArc {
  id: string
  name: string
  arcType: string
  startSceneIdx: number
  endSceneIdx: number
  intensity: number
  summary: string
}

/** Emotional peak (served as EmotionalPeak[]). */
export interface ReaderPeak {
  id: string
  offset: number
  intensity: number
  emotion: string
  snippet: string
  sceneId?: string | null
}

export interface ReaderNarrative {
  id: string
  title: string
  mode: ReaderMode
  wordCount: number
  readingTimeMin: number
  paragraphs: ReaderParagraph[]
  scenes: ReaderScene[]
  characters: ReaderCharacter[]
  locations: ReaderLocation[]
  arcs?: ReaderArc[]
  peaks?: ReaderPeak[]
  metadata?: string
  // Structured v2 analysis (parsed from metadata by the service).
  analysis?: ReaderAnalysis
}

/** Deterministic v2 analysis artifacts, parsed server-side from metadata. */
export interface ReaderAnalysis {
  intelligence?: Record<string, unknown>
  coOccurrence?: { edges?: Array<{ source: string; target: string; weight: number }>; maxWeight?: number }
  emotionTimeline?: Array<{ index: number; emotionScore?: number; valence?: number; arousal?: number; dominant?: string }>
  momentumTimeline?: Array<{ index: number; score?: number }>
  structure?: {
    segments?: Array<{ phase: string; startSceneIndex: number; endSceneIndex: number; confidence?: number }>
  }
}

export interface ReaderBookmark {
  id: string
  narrativeId: string
  sceneIndex: number | null
  paragraphIdx: number | null
  offset: number
  label: string | null
  note: string | null
  createdAt: string
}

export interface ReaderProgress {
  scrollPct: number
  sceneIndex: number
  paragraphIdx: number
}
