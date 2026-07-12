/**
 * Lemniscate — Search Service
 * ----------------------------------------------------------------------------
 * Thin facade over the pluggable search provider (`ISearchProvider`). All
 * matching, ranking, and pagination logic lives in the provider
 * (`DeterministicSearchProvider` today; an FTS5/vector provider can be swapped
 * in via `SEARCH_PROVIDER` with no changes here or in the API routes).
 *
 * Both the legacy (`/api/narratives/[id]/search`) and versioned
 * (`/api/v1/narratives/[id]/search`) routes call `searchNarrative`.
 */

import { getSearchProvider } from '@/lib/providers'
import type { SearchQuery, SearchHit, SearchResults } from '@/lib/providers/types'

// ─── Public types (stable names for API routes) ────────────────────────────

export type { SearchType } from '@/lib/providers/types'

/** Options accepted by {@link searchNarrative}. */
export type SearchOptions = SearchQuery

/** A single search hit. */
export type SearchResultItem = SearchHit

/** A ranked, paginated page of results plus the true total match count. */
export type SearchResult = SearchResults

// ─── Service methods ────────────────────────────────────────────────────────

/**
 * Search within a narrative. Delegates to the configured search provider.
 */
export async function searchNarrative(opts: SearchOptions): Promise<SearchResults> {
  const provider = await getSearchProvider()
  return provider.search(opts)
}
