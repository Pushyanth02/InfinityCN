/**
 * Lemniscate — Document Intelligence Engine Registry / Router
 * ----------------------------------------------------------------------------
 * Selects the intelligence engine for a document based on its detected
 * `documentType`. Engines that declare specific `domains` are preferred over
 * the default (`'ALL'`) engine. Registering a new domain engine here is the
 * ONLY change required to route a document category through a specialized
 * pipeline — the orchestrator, persistence, and reader are untouched.
 */
import type { DocumentType } from '@/lib/domain/enums'
import type { DocumentIntelligenceEngine } from './engine'
import { novelIntelligenceEngine } from './novel-engine'

/** The default engine used when no specialized engine claims a document type. */
const DEFAULT_ENGINE: DocumentIntelligenceEngine = novelIntelligenceEngine

/**
 * Specialized engines, checked before the default. Empty today — the
 * NovelIntelligenceEngine (`'ALL'`) currently handles every domain. Future
 * domain engines (e.g. research paper, legal, manual) are appended here.
 */
const SPECIALIZED_ENGINES: readonly DocumentIntelligenceEngine[] = []

/**
 * Resolve the intelligence engine for a document type. Falls back to the
 * default engine when no specialized engine matches.
 */
export function resolveIntelligenceEngine(
  documentType: DocumentType,
): DocumentIntelligenceEngine {
  for (const engine of SPECIALIZED_ENGINES) {
    if (engine.domains !== 'ALL' && engine.domains.includes(documentType)) {
      return engine
    }
  }
  return DEFAULT_ENGINE
}

/** All registered engines (default + specialized), for diagnostics/tests. */
export function listIntelligenceEngines(): readonly DocumentIntelligenceEngine[] {
  return [DEFAULT_ENGINE, ...SPECIALIZED_ENGINES]
}
