/**
 * Lemniscate — Provider Registration
 * ----------------------------------------------------------------------------
 * Registers all default provider implementations with the registry.
 * This module is imported once at startup (from instrumentation.ts or the
 * first API route hit) to ensure providers are available.
 *
 * To add a new provider:
 *   1. Create an implementation in `implementations/`.
 *   2. Import it here and call `registerProvider(slot, name, factory)`.
 *   3. Users select it via the corresponding environment variable.
 */

import { registerProvider } from './registry'

// Import implementations
import { DeterministicDocumentParser } from './implementations/deterministic-document-parser'
import { DeterministicNarrativeAnalyzer } from './implementations/deterministic-narrative-analyzer'
import { DeterministicCharacterAnalyzer } from './implementations/deterministic-character-analyzer'
import { DeterministicRelationshipAnalyzer } from './implementations/deterministic-relationship-analyzer'
import { LocalStorageProvider } from './implementations/local-storage'
import { SqliteQueueProvider } from './implementations/sqlite-queue'

// ─── Registration flag (prevents double-registration) ─────────────────────

let registered = false

/**
 * Register all default providers. Safe to call multiple times — subsequent
 * calls are no-ops.
 */
export function registerDefaultProviders(): void {
  if (registered) return
  registered = true

  // Document parsing
  registerProvider('documentParser', 'deterministic', () => new DeterministicDocumentParser())

  // Narrative analysis
  registerProvider('narrativeAnalyzer', 'deterministic', () => new DeterministicNarrativeAnalyzer())

  // Character analysis
  registerProvider('characterAnalyzer', 'deterministic', () => new DeterministicCharacterAnalyzer())

  // Relationship analysis
  registerProvider('relationshipAnalyzer', 'deterministic', () => new DeterministicRelationshipAnalyzer())

  // Storage
  registerProvider('storage', 'local', () => new LocalStorageProvider())

  // Queue
  registerProvider('queue', 'sqlite', () => new SqliteQueueProvider())
}

// Auto-register on import (side-effect)
registerDefaultProviders()

// ─── Re-export convenience accessors ──────────────────────────────────────
// This barrel re-exports the typed accessor functions from the registry so
// that consumers can `import { getStorageProvider } from '@/lib/providers'`
// without needing to know about the registry module.

export {
  resolveProvider,
  getConfiguredProviderName,
  hasProvider,
  getDocumentParser,
  getNarrativeAnalyzer,
  getCharacterAnalyzer,
  getRelationshipAnalyzer,
  getEmbeddingProvider,
  getSearchProvider,
  getStorageProvider,
  getQueueProvider,
} from './registry'

export type {
  IDocumentParser,
  INarrativeAnalyzer,
  ICharacterAnalyzer,
  IRelationshipAnalyzer,
  IEmbeddingProvider,
  ISearchProvider,
  IStorageProvider,
  IQueueProvider,
} from './types'
