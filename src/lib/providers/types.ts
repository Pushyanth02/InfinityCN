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
} from '@/lib/domain/enums'
import type { ExtractedText } from '@/lib/pipeline/extract'

// ─── Document Parser ──────────────────────────────────────────────────────

export interface ParserInput {
  /** Absolute path to the file on disk. */
  filePath: string
  /** Detected MIME type from the upload. */
  mimeType: string
  /** Original filename (for error messages / metadata). */
  originalName?: string
}

export interface IDocumentParser {
  readonly name: string
  /**
   * Extract text + diagnostics from a file, returning the canonical
   * `ExtractedText` contract the pipeline consumes. Using the shared type
   * (rather than a lossy re-declaration) lets the parser result flow straight
   * into the CanonicalDocument builder.
   */
  parse(input: ParserInput): Promise<ExtractedText>
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

export type SearchType = 'paragraph' | 'scene' | 'character' | 'event'

export interface SearchDocument {
  id: string
  narrativeId: string
  type: SearchType
  text: string
  metadata?: Record<string, unknown>
}

export interface SearchQuery {
  narrativeId: string
  query: string
  /** Restrict to a single type. Ignored when `types` is provided. */
  type?: SearchType
  /** Restrict to a set of types. Overrides `type` when non-empty. */
  types?: SearchType[]
  limit?: number
  offset?: number
}

export interface SearchHit {
  id: string
  type: SearchType
  text: string
  /** Deterministic relevance score (higher is more relevant). */
  score: number
  /** Number of case-insensitive occurrences of the query in the match. */
  matchCount: number
  highlight?: string
  metadata?: Record<string, unknown>
}

/** A ranked, paginated page of search hits plus the true total match count. */
export interface SearchResults {
  results: SearchHit[]
  total: number
}

export interface ISearchProvider {
  readonly name: string
  /**
   * Optional index maintenance. LIKE-based providers query the live tables and
   * implement these as no-ops; indexed providers (FTS/vector) use them to keep
   * an external index in sync.
   */
  index(narrativeId: string, documents: SearchDocument[]): Promise<void>
  search(query: SearchQuery): Promise<SearchResults>
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