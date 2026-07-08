/**
 * Lemniscate — Pipeline Event Types
 * ----------------------------------------------------------------------------
 * Typed event payloads for the internal event pipeline. Each pipeline stage
 * emits a specific event with structured metadata, replacing the generic
 * ProgressEvent with typed stage-specific events.
 *
 * These are ADDITIVE to the existing ProgressEvent system — the EventBus still
 * accepts the generic type for backwards compatibility, but new code should
 * use these typed events.
 */

import type { PipelineStage } from '../domain/enums'

// ─── Base ──────────────────────────────────────────────────────────────────

/** Base fields shared by all pipeline events. */
export interface PipelineEventBase {
  jobId: string
  documentId: string
  stage: PipelineStage
  timestamp: number
}

// ─── Stage-specific events ─────────────────────────────────────────────────

/** Fired when a document upload is complete and a job is queued. */
export interface DocumentUploadedEvent extends PipelineEventBase {
  stage: 'QUEUED'
  mode: string
  priority: number
}

/** Fired when text extraction completes. */
export interface ExtractionCompletedEvent extends PipelineEventBase {
  stage: 'EXTRACT'
  extractor: string
  charCount: number
  wordCount: number
  warnings: string[]
}

/** Fired when document metadata is generated. */
export interface MetadataGeneratedEvent extends PipelineEventBase {
  stage: 'SEGMENT'
  title: string
  titleSource: string
  author: string | null
  chapterCount: number
  language: string
}

/** Fired when characters are detected from the narrative. */
export interface CharactersExtractedEvent extends PipelineEventBase {
  stage: 'CINEMATIFY'
  characterCount: number
  protagonist: string | null
  antagonist: string | null
}

/** Fired when scene segmentation completes. */
export interface ScenesGeneratedEvent extends PipelineEventBase {
  stage: 'CINEMATIFY'
  sceneCount: number
  locationCount: number
  arcCount: number
}

/** Fired when the relationship graph is built. */
export interface RelationshipsGeneratedEvent extends PipelineEventBase {
  stage: 'ANALYZE'
  edgeCount: number
  communityCount: number
}

/** Fired when narrative analysis (emotion, momentum, structure) completes. */
export interface NarrativeCompletedEvent extends PipelineEventBase {
  stage: 'FINALIZE'
  narrativeIds: string[]
  durationMs: number
}

/** Fired when the pipeline completes and the reader is ready. */
export interface ReaderReadyEvent extends PipelineEventBase {
  stage: 'COMPLETED'
  narrativeIds: string[]
  sceneCount: number
  characterCount: number
  durationMs: number
}

/** Fired when the pipeline encounters an error. */
export interface PipelineErrorEvent extends PipelineEventBase {
  stage: 'FAILED'
  error: string
}

// ─── Union type ────────────────────────────────────────────────────────────

/** Discriminated union of all pipeline events. */
export type PipelineEvent =
  | DocumentUploadedEvent
  | ExtractionCompletedEvent
  | MetadataGeneratedEvent
  | CharactersExtractedEvent
  | ScenesGeneratedEvent
  | RelationshipsGeneratedEvent
  | NarrativeCompletedEvent
  | ReaderReadyEvent
  | PipelineErrorEvent

// ─── Factory helpers ───────────────────────────────────────────────────────

/** Create a typed pipeline event with sensible defaults. */
export function createEvent<T extends PipelineEventBase>(
  base: T,
): T {
  return { ...base, timestamp: base.timestamp || Date.now() }
}
