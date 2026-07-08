/**
 * Lemniscate — Domain Entities
 * ----------------------------------------------------------------------------
 * Pure domain entity interfaces representing the core business objects of the
 * Lemniscate platform. These types are the shared vocabulary between services,
 * providers, repositories, and the API layer.
 *
 * Design rules:
 *   - No imports from @prisma/client, next/server, or any infrastructure.
 *   - Every field uses a domain enum from ./enums.ts where applicable.
 *   - Entities are plain data (interfaces), not classes with behaviour.
 *   - Optional fields are marked with `?` and use `T | null` for DB-originated
 *     nulls (vs `undefined` for "not requested").
 *
 * The existing analysis-types.ts (NLP layer) remains the authoritative source
 * for analysis-internal types (DetectedCharacter, CoOccurrenceGraph, etc.).
 * These domain entities represent the persisted / API-facing shapes.
 */

import type {
  DocumentStatus,
  JobStatus,
  PipelineStage,
  JobMode,
  NarrativeMode,
  CharacterRole,
  StructurePhase,
  SceneTimeOfDay,
  SceneMood,
  ParagraphType,
  EventType,
  EmotionLabel,
  ArcType,
  LocationType,
} from './enums'

// ─── Document ─────────────────────────────────────────────────────────────

export interface Document {
  id: string
  originalName: string
  storageName: string
  mimeType: string
  sizeBytes: number
  fileHash: string
  status: DocumentStatus
  createdAt: string
  updatedAt: string
  // Detected metadata
  title: string | null
  titleSource: string | null
  author: string | null
  subtitle: string | null
  series: string | null
  language: string | null
  wordCount: number | null
  readingTimeMin: number | null
  chapterCount: number
  detectedMeta: string // JSON string
}

// ─── Job ──────────────────────────────────────────────────────────────────

export interface Job {
  id: string
  documentId: string
  mode: JobMode
  status: JobStatus
  progress: number // 0..100
  stage: PipelineStage | string | null
  error: string | null
  priority: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
}

// ─── RawText ──────────────────────────────────────────────────────────────

export interface RawText {
  id: string
  documentId: string
  content: string
  charCount: number
  wordCount: number
  lineCount: number
  language: string
  encoding: string
  createdAt: string
}

// ─── Narrative ────────────────────────────────────────────────────────────

export interface Narrative {
  id: string
  documentId: string
  jobId: string
  mode: NarrativeMode
  title: string
  content: string // markdown
  plainText: string
  wordCount: number
  charCount: number
  readingTimeMin: number
  paragraphCount: number
  sceneCount: number
  metadata: string // JSON blob
  createdAt: string
}

// ─── Paragraph ────────────────────────────────────────────────────────────

export interface Paragraph {
  id: string
  narrativeId: string
  index: number
  text: string
  type: ParagraphType
  speaker: string | null
  rawText: string | null
  wordCount: number
  charCount: number
  startOffset: number
  endOffset: number
}

// ─── Scene ────────────────────────────────────────────────────────────────

export interface Scene {
  id: string
  narrativeId: string
  index: number
  title: string
  summary: string
  location: string | null
  timeOfDay: SceneTimeOfDay | string | null
  mood: SceneMood | string | null
  tensionScore: number
  emotionScore: number
  momentumScore: number
  arousalScore: number
  valence: number
  structurePhase: StructurePhase | string | null
  startOffset: number
  endOffset: number
  charCount: number
  paragraphCount: number
  dialogueRatio: number
  eventCount: number
}

// ─── Character ────────────────────────────────────────────────────────────

export interface Character {
  id: string
  narrativeId: string
  name: string
  aliases: string // JSON array
  mentions: number
  firstAppearanceOffset: number
  role: CharacterRole
  dialogueLines: number
  description: string | null
  metadata: string // JSON blob
  importanceScore: number
  confidenceScore: number
  speakingCount: number
  lastAppearanceOffset: number
}

// ─── Location ─────────────────────────────────────────────────────────────

export interface Location {
  id: string
  narrativeId: string
  name: string
  mentions: number
  type: LocationType | string
  firstAppearanceOffset: number
}

// ─── Event ────────────────────────────────────────────────────────────────

export interface NarrativeEvent {
  id: string
  narrativeId: string
  sceneId: string | null
  index: number
  type: EventType
  description: string
  participants: string // JSON array
  offset: number
  intensity: number
}

// ─── Narrative Arc ────────────────────────────────────────────────────────

export interface NarrativeArc {
  id: string
  narrativeId: string
  name: string
  arcType: ArcType
  startSceneIdx: number
  endSceneIdx: number
  intensity: number
  summary: string
}

// ─── Emotional Peak ───────────────────────────────────────────────────────

export interface EmotionalPeak {
  id: string
  narrativeId: string
  sceneId: string | null
  offset: number
  intensity: number
  emotion: EmotionLabel | string
  snippet: string
}

// ─── Processing Log ───────────────────────────────────────────────────────

export interface ProcessingLog {
  id: string
  jobId: string
  stage: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  message: string
  metadata: string // JSON
  timestamp: string
}

// ─── Reading Progress ─────────────────────────────────────────────────────

export interface ReadingProgress {
  id: string
  narrativeId: string
  scrollPct: number
  sceneIndex: number
  paragraphIdx: number
  updatedAt: string
}

// ─── Bookmark ─────────────────────────────────────────────────────────────

export interface Bookmark {
  id: string
  narrativeId: string
  sceneIndex: number | null
  paragraphIdx: number | null
  offset: number
  label: string | null
  note: string | null
  createdAt: string
}

// ─── Relationship Graph (NEW — Milestone 3) ───────────────────────────────

/** A directed or undirected relationship edge between two characters. */
export interface RelationshipEdge {
  sourceCharacterId: string
  sourceName: string
  targetCharacterId: string
  targetName: string
  /** Number of scenes in which both characters co-occur. */
  coOccurrences: number
  /** Composite relationship strength score [0..100]. */
  strength: number
  /** Dialogue interactions between these two characters. */
  dialogueInteractions: number
}

/** Centrality metrics for a single character in the relationship graph. */
export interface CharacterCentrality {
  characterId: string
  name: string
  /** Number of distinct characters this one co-occurs with. */
  degree: number
  /** Normalized degree centrality [0..1]. */
  degreeCentrality: number
  /** Betweenness centrality (how often on shortest paths). */
  betweennessCentrality: number
  /** Closeness centrality (inverse of average distance). */
  closenessCentrality: number
}

/** A community/faction detected in the character graph. */
export interface CharacterCommunity {
  id: number
  memberIds: string[]
  memberNames: string[]
  /** Internal edge density [0..1]. */
  cohesion: number
}

/** Complete relationship graph output from the Relationship Engine. */
export interface RelationshipGraph {
  edges: RelationshipEdge[]
  centralities: CharacterCentrality[]
  communities: CharacterCommunity[]
  /** Total number of unique character pairs with at least one co-occurrence. */
  edgeCount: number
  /** Highest edge strength in the graph (0 when empty). */
  maxStrength: number
}