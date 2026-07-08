/**
 * Lemniscate — Deterministic Narrative Analyzer Provider
 * ----------------------------------------------------------------------------
 * Wraps the existing `pipeline/cinematified.ts` module behind the
 * `INarrativeAnalyzer` interface.
 */

import { transformCinematified, type CinematifiedResult } from '@/lib/pipeline/cinematified'
import type { OriginalParagraph } from '@/lib/pipeline/original'
import type { INarrativeAnalyzer, NarrativeAnalysisInput, NarrativeAnalysisResult } from '../types'

export class DeterministicNarrativeAnalyzer implements INarrativeAnalyzer {
  readonly name = 'deterministic'

  async analyze(input: NarrativeAnalysisInput): Promise<NarrativeAnalysisResult> {
    const cinema: CinematifiedResult = transformCinematified(
      input.text,
      input.paragraphs as OriginalParagraph[],
      input.title,
    )
    return cinema as unknown as NarrativeAnalysisResult
  }
}
