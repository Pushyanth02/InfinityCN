/**
 * Lemniscate — Document Intelligence Engine (DIE)
 * ----------------------------------------------------------------------------
 * Domain-agnostic contract for turning a CanonicalDocument into structured
 * intelligence (scenes, characters, locations, events, arcs, emotion,
 * momentum, structure).
 *
 * ARCHITECTURE DECISION (M2):
 *   Narrative ("cinematified") analysis is no longer *the platform* — it is ONE
 *   engine among many. Each engine declares the document `domains` it handles;
 *   the orchestrator resolves an engine from the CanonicalDocument's
 *   `documentType` via `resolveIntelligenceEngine()`. Today a single
 *   `NovelIntelligenceEngine` handles every domain (`'ALL'`), preserving the
 *   current behavior exactly; future domain engines (research paper, legal,
 *   manual, …) register in the router without touching the orchestrator,
 *   persistence, or the reader.
 *
 * The result type is intentionally the rich `CinematifiedResult` so that
 * persistence and reader models remain unchanged for this milestone. A
 * domain-neutral rename of the result shape is a later, migration-gated step.
 *
 * Engines are deterministic and offline (no AI).
 */
import type { CanonicalDocument } from '@/lib/canonical'
import type { OriginalParagraph } from '@/lib/pipeline/original'
import type { CinematifiedResult } from '@/lib/pipeline/cinematified'
import type { DocumentType } from '@/lib/domain/enums'

/**
 * Input contract for every intelligence engine: the canonical document (the
 * single normalized representation) plus the reconstructed paragraphs from the
 * ORIGINAL-mode transform. Paragraphs are passed explicitly because they carry
 * the verbatim source spans that scene/character detection relies on.
 */
export interface IntelligenceInput {
  canonical: CanonicalDocument
  paragraphs: OriginalParagraph[]
}

/** Structured intelligence result (currently the rich narrative shape). */
export type IntelligenceResult = CinematifiedResult

/**
 * A document-domain intelligence engine. Implementations must be pure and
 * deterministic for a given input.
 */
export interface DocumentIntelligenceEngine {
  /** Stable identifier for logging and diagnostics. */
  readonly name: string
  /** Document domains this engine handles, or `'ALL'` for the default engine. */
  readonly domains: readonly DocumentType[] | 'ALL'
  analyze(input: IntelligenceInput): IntelligenceResult
}
