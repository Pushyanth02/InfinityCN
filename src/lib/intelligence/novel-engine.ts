/**
 * Lemniscate — Novel Intelligence Engine
 * ----------------------------------------------------------------------------
 * The prose-fiction Document Intelligence Engine. Wraps the deterministic
 * `transformCinematified` composition layer (which itself delegates to the
 * individually-testable `nlp/*` sub-engines: scenes, characters, intelligence,
 * emotion, momentum, structure).
 *
 * It consumes the CanonicalDocument (rawText + title + documentType) and the
 * reconstructed paragraphs. Output is 100% deterministic and identical to the
 * previous direct `transformCinematified` call — this engine is a
 * behavior-preserving seam introduced in M2.
 */
import { transformCinematified } from '@/lib/pipeline/cinematified'
import type {
  DocumentIntelligenceEngine,
  IntelligenceInput,
  IntelligenceResult,
} from './engine'

export class NovelIntelligenceEngine implements DocumentIntelligenceEngine {
  readonly name = 'novel'

  /** Default engine — handles every document domain until specialized engines exist. */
  readonly domains = 'ALL' as const

  analyze(input: IntelligenceInput): IntelligenceResult {
    const { canonical, paragraphs } = input
    return transformCinematified(
      canonical.rawText,
      paragraphs,
      canonical.metadata.title,
    )
  }
}

/** Shared singleton — the engine is stateless. */
export const novelIntelligenceEngine = new NovelIntelligenceEngine()
