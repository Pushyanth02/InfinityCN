/**
 * Lemniscate — Search Service
 * ----------------------------------------------------------------------------
 * Full-text search within narratives. Uses SQLite LIKE queries today;
 * designed to be backed by the pluggable SearchProvider when available.
 */

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────

export interface SearchOptions {
  narrativeId: string
  query: string
  type?: 'paragraph' | 'scene' | 'character' | 'event'
  limit?: number
  offset?: number
}

export interface SearchResultItem {
  id: string
  type: 'paragraph' | 'scene' | 'character' | 'event'
  text: string
  score: number
  highlight?: string
  metadata?: Record<string, unknown>
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Search within a narrative across paragraphs, scenes, characters, and events.
 * Uses lightweight SQL LIKE queries. Each result includes a snippet highlight.
 */
export async function searchNarrative(opts: SearchOptions): Promise<{
  results: SearchResultItem[]
  total: number
}> {
  const { narrativeId, query, type, limit = 50, offset = 0 } = opts
  const results: SearchResultItem[] = []

  // Search paragraphs
  if (!type || type === 'paragraph') {
    const rows = await db.paragraph.findMany({
      where: { narrativeId, text: { contains: query } },
      take: limit,
      skip: offset,
      orderBy: { index: 'asc' },
    })
    for (const r of rows) {
      results.push({
        id: r.id,
        type: 'paragraph',
        text: r.text,
        score: 1,
        highlight: makeHighlight(r.text, query),
        metadata: { index: r.index, paragraphType: r.type, speaker: r.speaker },
      })
    }
  }

  // Search scenes
  if (!type || type === 'scene') {
    const rows = await db.scene.findMany({
      where: {
        narrativeId,
        OR: [
          { title: { contains: query } },
          { summary: { contains: query } },
          { location: { contains: query } },
        ],
      },
      take: limit,
      skip: offset,
      orderBy: { index: 'asc' },
    })
    for (const r of rows) {
      results.push({
        id: r.id,
        type: 'scene',
        text: r.title + ' — ' + r.summary,
        score: 1,
        metadata: { index: r.index, location: r.location, mood: r.mood },
      })
    }
  }

  // Search characters
  if (!type || type === 'character') {
    const rows = await db.character.findMany({
      where: {
        narrativeId,
        OR: [
          { name: { contains: query } },
          { aliases: { contains: query } },
          { description: { contains: query } },
        ],
      },
      take: limit,
      skip: offset,
      orderBy: { mentions: 'desc' },
    })
    for (const r of rows) {
      results.push({
        id: r.id,
        type: 'character',
        text: r.name,
        score: 1,
        metadata: { role: r.role, mentions: r.mentions, aliases: r.aliases },
      })
    }
  }

  // Search events
  if (!type || type === 'event') {
    const rows = await db.event.findMany({
      where: { narrativeId, description: { contains: query } },
      take: limit,
      skip: offset,
      orderBy: { index: 'asc' },
    })
    for (const r of rows) {
      results.push({
        id: r.id,
        type: 'event',
        text: r.description,
        score: 1,
        metadata: { type: r.type, intensity: r.intensity, offset: r.offset },
      })
    }
  }

  return { results, total: results.length }
}

// ─── Helpers ──────────────────────────────────────────────────────────────



/**
 * Extract a snippet around the first match of `query` in `text`.
 */
function makeHighlight(text: string, query: string, windowChars = 60): string | undefined {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return undefined
  const start = Math.max(0, idx - windowChars)
  const end = Math.min(text.length, idx + query.length + windowChars)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end) + suffix
}