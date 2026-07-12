/**
 * Lemniscate — Document Intelligence Engine (DIE) public surface.
 *
 * Consumers import the router (`resolveIntelligenceEngine`) and, if needed, the
 * engine types. Individual engine implementations are internal detail.
 */
export type {
  DocumentIntelligenceEngine,
  IntelligenceInput,
  IntelligenceResult,
} from './engine'
export { NovelIntelligenceEngine, novelIntelligenceEngine } from './novel-engine'
export { resolveIntelligenceEngine, listIntelligenceEngines } from './registry'
