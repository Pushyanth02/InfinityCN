/**
 * Lemniscate — Provider Interface Contracts
 * ----------------------------------------------------------------------------
 * Defines the pluggable provider interfaces that abstract every major
 * processing capability. Each interface has at least one deterministic
 * implementation today; cloud/AI implementations can be added later without
 * changing any service or API code.
 *
 * Provider selection is driven by environment variables via the registry
 * (./registry.ts). The default for every capability is "deterministic".
 *
 * Design rules:
 *   - Every provider has a unique `name` string for logging and diagnostics.
 *   - Methods are async to accommodate future network-bound providers.
 *   - Inputs/outputs use domain types, never Prisma types.
 *   - Providers are stateless (or hold only immutable configuration).
 */

import type {
  DetectedCharacter,
  CharacterAnalysis,
} from '@/lib/nlp/analysis-types'
import type {
  RelationshipGraph,
} from '@/lib/domain/entities'
import type {
  JobMode,
  NarrativeMode,
} from '@/lib/domain/enums'

// ─── Document Parser ──────────────────────────────────────────────────────

export interface ParserInput {
  /** Absolute path to the file on disk. */
  filePath: string
  /** Detected MIME type from the upload. */
  mimeType: string
  /** Original filename (for error messages / metadata). */
  originalName?: string
}

export interface ParserPageMeta {
  pageCount?: number
}

export interface ParserEmbeddedMeta {
  title?: string
  author?: string
  subject?: string
  keywords?: string
  creator?: string
}

export interface ParserOutput {
  text: string
  charCount: number
  wordCount: number
  lineCount: number
  language: string
  encoding: string
  extractor: string
  warnings: string[]
  meta?: ParserPageMeta
  embedded?: ParserEmbeddedMeta
}

export interface IDocumentParser {
  readonly name: string
  parse(input: ParserInput): Promise<ParserOutput>
}

// ─── Narrative Analyzer ───────────────────────────────────────────────────

export interface NarrativeAnalysisInput {
  text: string
  paragraphs: Array<{ text: string; startOffset: number }>
  title: string
  mode: NarrativeMode
}

export interface SceneDetectionResult {
  scenes: Array<{
    index: number
    title: string
    summary: string
    location: string | null
    timeOfDay: string | null
    mood: string | null
    tensionScore: number
    emotionScore: number
    momentumScore: number
    arousalScore: number
    valence: number
    structurePhase: string | null
    startOffset: number
    endOffset: number
    charCount: number
    paragraphCount: number
    dialogueRatio: number
    eventCount: number
    paragraphs: Array<{
      index: number
      text: string
      type: string
      speaker: string | null
      rawText: string | null
      wordCount: number
      charCount: number
      startOffset: number
      endOffset: number
    }>
  }>
  sceneCount: number
}

export interface NarrativeAnalysisResult extends SceneDetectionResult {
  locations: Array<{
    name: string
    mentions: number
    type: string
    firstAppearanceOffset: number
  }>
  events: Array<{
    index: number
    sceneIndex: number
    type: string
    description: string
    participants: string[]
    offset: number
    intensity: number
  }>
  arcs: Array<{
    name: string
    arcType: string
    startSceneIdx: number
    endSceneIdx: number
    intensity: number
    summary: string
  }>
  peaks: Array<{
    offset: number
    intensity: number
    emotion: string
    snippet: string
    sceneIndex: number | null
  }>
  intelligence: unknown
  coOccurrence: unknown
  emotionTimeline: unknown
  momentumTimeline: unknown
  structure: unknown
  transforms: string[]
  plainText: string
  content: string
}

export interface INarrativeAnalyzer {
  readonly name: string
  analyze(input: NarrativeAnalysisInput): Promise<NarrativeAnalysisResult>
}

// ─── Character Analyzer ───────────────────────────────────────────────────

export interface ICharacterAnalyzer {
  readonly name: string
  analyze(
    text: string,
    paragraphs: Array<{ text: string; startOffset: number }>,
    scenes: Array<{ index: number; startOffset: number; endOffset: number }>,
  ): Promise<CharacterAnalysis>
}

// ─── Relationship Analyzer ────────────────────────────────────────────────

export interface RelationshipAnalysisInput {
  characters: DetectedCharacter[]
  /** Scene-level character participation: sceneIndex → set of character IDs. */
  sceneParticipants: Map<number, Set<string>>
  /** Dialogue lines: array of { speaker, offset, text } for interaction counting. */
  dialogueLines: Array<{ speaker: string; offset: number; text: string }>
  totalScenes: number
}

export interface IRelationshipAnalyzer {
  readonly name: string
  analyze(input: RelationshipAnalysisInput): Promise<RelationshipGraph>
}

// ─── Embedding Provider ───────────────────────────────────────────────────

export interface IEmbeddingProvider {
  readonly name: string
  readonly dimensions: number
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

// ─── Search Provider ──────────────────────────────────────────────────────

export interface SearchDocument {
  id: string
  narrativeId: string
  type: 'paragraph' | 'scene' | 'character' | 'event'
  text: string
  metadata?: Record<string, unknown>
}

export interface SearchQuery {
  narrativeId: string
  query: string
  type?: SearchDocument['type']
  limit?: number
  offset?: number
}

export interface SearchResult {
  id: string
  type: SearchDocument['type']
  text: string
  score: number
  highlight?: string
  metadata?: Record<string, unknown>
}

export interface ISearchProvider {
  readonly name: string
  index(narrativeId: string, documents: SearchDocument[]): Promise<void>
  search(query: SearchQuery): Promise<SearchResult[]>
  remove(narrativeId: string): Promise<void>
}

// ─── Storage Provider ─────────────────────────────────────────────────────

export interface IStorageProvider {
  readonly name: string
  save(key: string, data: Buffer): Promise<void>
  read(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Returns a URL or path for serving the file. */
  getUrl(key: string): string
}

// ─── Queue Provider ───────────────────────────────────────────────────────

export interface QueueJob {
  jobId: string
  documentId: string
  mode: JobMode
}

export interface IQueueProvider {
  readonly name: string
  /** Atomically claim the next available job. Returns null if none available. */
  claimNext(): Promise<QueueJob | null>
  /** Re-queue stalled jobs that exceed the stale threshold. */
  rehydrateStalled(staleThresholdMs?: number): Promise<number>
  /** Move a permanently failed job to the dead-letter state. */
  deadLetter(jobId: string, error: string): Promise<void>
  /** Re-queue a dead-lettered job. */
  retryDeadLetter(jobId: string): Promise<boolean>
}