/**
 * Lemniscate — Deterministic Relationship Analyzer Provider
 * ----------------------------------------------------------------------------
 * Wraps the `nlp/relationships.ts` engine behind the `IRelationshipAnalyzer`
 * interface.
 */

import { analyzeRelationships } from '@/lib/nlp/relationships'
import type { RelationshipGraph } from '@/lib/domain/entities'
import type { IRelationshipAnalyzer, RelationshipAnalysisInput } from '../types'

export class DeterministicRelationshipAnalyzer implements IRelationshipAnalyzer {
  readonly name = 'deterministic'

  async analyze(input: RelationshipAnalysisInput): Promise<RelationshipGraph> {
    return analyzeRelationships(input)
  }
}