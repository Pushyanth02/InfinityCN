/**
 * Lemniscate — Provider Registry
 * ----------------------------------------------------------------------------
 * Lightweight dependency-injection registry for pluggable providers.
 * Provider selection is driven by environment variables:
 *
 *   DOCUMENT_PARSER_PROVIDER     = deterministic (default)
 *   NARRATIVE_ANALYZER_PROVIDER  = deterministic (default)
 *   CHARACTER_ANALYZER_PROVIDER  = deterministic (default)
 *   RELATIONSHIP_ANALYZER_PROVIDER = deterministic (default)
 *   EMBEDDING_PROVIDER           = (none by default — UNIMPLEMENTED SEAM; see note)
 *   SEARCH_PROVIDER              = deterministic (default)
 *   STORAGE_PROVIDER             = local (default)
 *   QUEUE_PROVIDER               = sqlite (default)
 *
 * Future providers (e.g. "azure_di", "openai", "supabase", "redis") are
 * registered here without touching service or API code.
 *
 * NOTE — unimplemented seams (do not treat as wired-up features):
 *   • `embedding` slot: there is NO registered implementation and NO caller in
 *     the codebase (getEmbeddingProvider() short-circuits to null when the env
 *     var is unset). This is an intentional extension point, not a working
 *     feature. Do not assume embeddings are generated anywhere.
 *   • `REDIS_URL`: Redis-backed RATE LIMITING is implemented (see
 *     src/lib/middleware/rate-limit.ts — ioredis with memory fallback). Redis
 *     for QUEUE coordination / horizontal scaling is the actual unimplemented
 *     part. The two are distinct; do not conflate them.
 */

import type {
  IDocumentParser,
  INarrativeAnalyzer,
  ICharacterAnalyzer,
  IRelationshipAnalyzer,
  IEmbeddingProvider,
  ISearchProvider,
  IStorageProvider,
  IQueueProvider,
} from './types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('provider-registry')

// ─── Provider type keys ───────────────────────────────────────────────────

export type ProviderSlot =
  | 'documentParser'
  | 'narrativeAnalyzer'
  | 'characterAnalyzer'
  | 'relationshipAnalyzer'
  | 'embedding'
  | 'search'
  | 'storage'
  | 'queue'

// ─── Factory function types ───────────────────────────────────────────────

type Factory<T> = () => T | Promise<T>

// ─── Registry state ───────────────────────────────────────────────────────

/** Map of slot → provider-name → factory. */
const factories = new Map<ProviderSlot, Map<string, Factory<unknown>>>()

/** Cache of resolved singleton instances. */
const instances = new Map<ProviderSlot, unknown>()

/** Map of slot → env var name. */
const envVarMap: Record<ProviderSlot, string> = {
  documentParser: 'DOCUMENT_PARSER_PROVIDER',
  narrativeAnalyzer: 'NARRATIVE_ANALYZER_PROVIDER',
  characterAnalyzer: 'CHARACTER_ANALYZER_PROVIDER',
  relationshipAnalyzer: 'RELATIONSHIP_ANALYZER_PROVIDER',
  embedding: 'EMBEDDING_PROVIDER',
  search: 'SEARCH_PROVIDER',
  storage: 'STORAGE_PROVIDER',
  queue: 'QUEUE_PROVIDER',
}

/** Default provider name for each slot. */
const defaults: Partial<Record<ProviderSlot, string>> = {
  documentParser: 'deterministic',
  narrativeAnalyzer: 'deterministic',
  characterAnalyzer: 'deterministic',
  relationshipAnalyzer: 'deterministic',
  search: 'deterministic',
  storage: 'local',
  queue: 'sqlite',
}

// ─── Registration API ─────────────────────────────────────────────────────

/**
 * Register a provider factory for a given slot + name.
 * Called during module initialization (side-effect at import time).
 */
export function registerProvider<T>(
  slot: ProviderSlot,
  name: string,
  factory: Factory<T>,
): void {
  let slotMap = factories.get(slot)
  if (!slotMap) {
    slotMap = new Map()
    factories.set(slot, slotMap)
  }
  slotMap.set(name, factory as Factory<unknown>)
  logger.debug('Provider registered', { slot, name })
}

// ─── Resolution API ───────────────────────────────────────────────────────

/**
 * Resolve a provider for the given slot. The provider name is read from the
 * environment variable mapped to that slot, falling back to the default.
 *
 * Instances are cached (singleton) — the factory is called at most once per slot.
 */
export async function resolveProvider<T>(slot: ProviderSlot): Promise<T> {
  // Check cache
  const cached = instances.get(slot)
  if (cached) return cached as T

  const envVar = envVarMap[slot]
  const requestedName = process.env[envVar] || defaults[slot]

  if (!requestedName) {
    throw new Error(
      `No provider configured for slot "${slot}". Set ${envVar} or register a default.`,
    )
  }

  const slotMap = factories.get(slot)
  if (!slotMap || !slotMap.has(requestedName)) {
    throw new Error(
      `Provider "${requestedName}" is not registered for slot "${slot}". ` +
        `Available: ${slotMap ? [...slotMap.keys()].join(', ') : 'none'}.`,
    )
  }

  const factory = slotMap.get(requestedName)!
  const instance = await factory()
  instances.set(slot, instance)
  logger.info('Provider resolved', { slot, name: requestedName })
  return instance as T
}

/**
 * Get the name of the currently-configured provider for a slot
 * (without instantiating it).
 */
export function getConfiguredProviderName(slot: ProviderSlot): string {
  const envVar = envVarMap[slot]
  return process.env[envVar] || defaults[slot] || 'none'
}

/** Check whether a provider has been registered for a slot+name. */
export function hasProvider(slot: ProviderSlot, name: string): boolean {
  return factories.get(slot)?.has(name) ?? false
}

// ─── Convenience accessors ────────────────────────────────────────────────

export async function getDocumentParser(): Promise<IDocumentParser> {
  return resolveProvider<IDocumentParser>('documentParser')
}

export async function getNarrativeAnalyzer(): Promise<INarrativeAnalyzer> {
  return resolveProvider<INarrativeAnalyzer>('narrativeAnalyzer')
}

export async function getCharacterAnalyzer(): Promise<ICharacterAnalyzer> {
  return resolveProvider<ICharacterAnalyzer>('characterAnalyzer')
}

export async function getRelationshipAnalyzer(): Promise<IRelationshipAnalyzer> {
  return resolveProvider<IRelationshipAnalyzer>('relationshipAnalyzer')
}

export async function getEmbeddingProvider(): Promise<IEmbeddingProvider | null> {
  if (!process.env.EMBEDDING_PROVIDER) return null
  return resolveProvider<IEmbeddingProvider>('embedding')
}

export async function getSearchProvider(): Promise<ISearchProvider> {
  return resolveProvider<ISearchProvider>('search')
}

export async function getStorageProvider(): Promise<IStorageProvider> {
  return resolveProvider<IStorageProvider>('storage')
}

export async function getQueueProvider(): Promise<IQueueProvider> {
  return resolveProvider<IQueueProvider>('queue')
}