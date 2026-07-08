/**
 * Lemniscate — Deterministic Character Analyzer Provider
 * ----------------------------------------------------------------------------
 * Wraps the existing `nlp/characters.ts` module behind the
 * `ICharacterAnalyzer` interface.
 */

import { analyzeCharacters } from '@/lib/nlp/characters'
import type { CharacterAnalysis } from '@/lib/nlp/analysis-types'
import type { ICharacterAnalyzer } from '../types'

export class DeterministicCharacterAnalyzer implements ICharacterAnalyzer {
  readonly name = 'deterministic'

  async analyze(
    text: string,
    paragraphs: Array<{ text: string; startOffset: number }>,
    scenes: Array<{ index: number; startOffset: number; endOffset: number }>,
  ): Promise<CharacterAnalysis> {
    return analyzeCharacters(text, paragraphs, scenes)
  }
}
