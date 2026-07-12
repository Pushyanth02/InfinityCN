/**
 * Lemniscate — Deterministic Search Provider
 * ----------------------------------------------------------------------------
 * SQLite `LIKE`-based search over a narrative's paragraphs, scenes, characters,
 * and events. Implements the `ISearchProvider` seam so that an FTS5 or vector
 * provider can be swapped in later via `SEARCH_PROVIDER` with no changes to the
 * search service or API routes.
 *
 * Ranking is deterministic (entity weight + match frequency + first-match
 * position + whole-word bonus). `total` is the true match count; results are
 * ranked then sliced to the requested `[offset, offset + limit)` window.
 *
 * Only matching rows are read from the DB (via `contains`) — the whole
 * narrative is never loaded into memory. There is no external index, so
 * `index()` and `remove()` are no-ops.
 */

import { db } from '@/lib/db'
import type {
  ISearchProvider,
  SearchQuery,
  SearchHit,
  SearchResults,
  SearchType,
} from '../types'

const ALL_TYPES: readonly SearchType[] = ['paragraph', 'scene', 'character', 'event']

/** Relative importance of a match by the entity it was found in. */
const TYPE_WEIGHT: Record<SearchType, number> = {
  character: 3,
  scene: 2,
  event: 1.5,
  paragraph: 1,
}

export class DeterministicSearchProvider implements ISearchProvider {
  readonly name = 'deterministic'

  /** No external index — LIKE queries read the live tables directly. */
  async index(): Promise<void> {
    /* no-op */
  }

  /** No external index to prune. */
  async remove(): Promise<void> {
    /* no-op */
  }

  async search(query: SearchQuery): Promise<SearchResults> {
    const { narrativeId, limit = 50, offset = 0 } = query
    const q = query.query.trim()
    if (!q) return { results: [], total: 0 }

    const requested = new Set<SearchType>(
      query.types && query.types.length
        ? query.types
        : query.type
          ? [query.type]
          : ALL_TYPES,
    )

    const all: SearchHit[] = []

    // Paragraphs
    if (requested.has('paragraph')) {
      const rows = await db.paragraph.findMany({
        where: { narrativeId, text: { contains: q } },
        orderBy: { index: 'asc' },
      })
      for (const r of rows) {
        const haystack = r.text
        all.push({
          id: r.id,
          type: 'paragraph',
          text: r.text,
          matchCount: countMatches(haystack, q),
          score: scoreMatch(haystack, q, 'paragraph'),
          highlight: makeHighlight(haystack, q),
          metadata: { index: r.index, paragraphType: r.type, speaker: r.speaker },
        })
      }
    }

    // Scenes
    if (requested.has('scene')) {
      const rows = await db.scene.findMany({
        where: {
          narrativeId,
          OR: [
            { title: { contains: q } },
            { summary: { contains: q } },
            { location: { contains: q } },
          ],
        },
        orderBy: { index: 'asc' },
      })
      for (const r of rows) {
        const haystack = [r.title, r.summary, r.location].filter(Boolean).join(' — ')
        all.push({
          id: r.id,
          type: 'scene',
          text: `${r.title} — ${r.summary ?? ''}`,
          matchCount: countMatches(haystack, q),
          score: scoreMatch(haystack, q, 'scene'),
          highlight: makeHighlight(haystack, q),
          metadata: { index: r.index, location: r.location, mood: r.mood },
        })
      }
    }

    // Characters
    if (requested.has('character')) {
      const rows = await db.character.findMany({
        where: {
          narrativeId,
          OR: [
            { name: { contains: q } },
            { aliases: { contains: q } },
            { description: { contains: q } },
          ],
        },
        orderBy: { mentions: 'desc' },
      })
      for (const r of rows) {
        const haystack = [r.name, r.aliases, r.description].filter(Boolean).join(' ')
        all.push({
          id: r.id,
          type: 'character',
          text: r.name,
          matchCount: countMatches(haystack, q),
          score: scoreMatch(haystack, q, 'character'),
          highlight: makeHighlight(haystack, q),
          metadata: { role: r.role, mentions: r.mentions, aliases: r.aliases },
        })
      }
    }

    // Events
    if (requested.has('event')) {
      const rows = await db.event.findMany({
        where: { narrativeId, description: { contains: q } },
        orderBy: { index: 'asc' },
      })
      for (const r of rows) {
        const haystack = r.description
        all.push({
          id: r.id,
          type: 'event',
          text: r.description,
          matchCount: countMatches(haystack, q),
          score: scoreMatch(haystack, q, 'event'),
          highlight: makeHighlight(haystack, q),
          metadata: { type: r.type, intensity: r.intensity, offset: r.offset },
        })
      }
    }

    // Deterministic ranking: score desc, matchCount desc, then stable tie-breaks.
    all.sort(
      (a, b) =>
        b.score - a.score ||
        b.matchCount - a.matchCount ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    )

    const total = all.length
    const results = all.slice(offset, offset + limit)
    return { results, total }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Count non-overlapping, case-insensitive occurrences of `query` in `text`. */
function countMatches(text: string, query: string): number {
  const needle = query.toLowerCase()
  if (!needle) return 0
  const hay = text.toLowerCase()
  let count = 0
  let idx = hay.indexOf(needle)
  while (idx !== -1) {
    count++
    idx = hay.indexOf(needle, idx + needle.length)
  }
  return count
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Deterministic relevance score combining entity weight, match frequency,
 * position of the first match, and a whole-word bonus.
 */
function scoreMatch(text: string, query: string, type: SearchType): number {
  const count = countMatches(text, query)
  if (count === 0) return 0
  const hay = text.toLowerCase()
  const needle = query.toLowerCase()
  const first = hay.indexOf(needle)
  const positionFactor = text.length > 0 ? 1 - Math.min(first, text.length) / text.length : 0
  const freqFactor = Math.min(count, 10) / 10
  const wholeWord = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(text) ? 0.5 : 0
  return Number((TYPE_WEIGHT[type] + freqFactor + positionFactor + wholeWord).toFixed(4))
}

/** Extract a snippet around the first match of `query` in `text`. */
function makeHighlight(text: string, query: string, windowChars = 60): string | undefined {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return undefined
  const start = Math.max(0, idx - windowChars)
  const end = Math.min(text.length, idx + query.length + windowChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end) + suffix
}
