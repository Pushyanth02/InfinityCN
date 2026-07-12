/**
 * GET /api/narratives/[id]/search?q=query
 * Full-text search across paragraphs, scenes, and characters.
 * Returns matching snippets with context.
 *
 * Thin wrapper over the shared search service. The service owns all matching,
 * ranking, and pagination logic; this route only maps the result into the
 * legacy `{ type, refId, title, snippet, matchCount }` shape that the reader UI
 * consumes and preserves the legacy guards (min length, length cap, 404).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { searchNarrative, type SearchResultItem } from '@/lib/services/search.service'

interface LegacySearchResult {
  type: 'paragraph' | 'scene' | 'character'
  refId: string
  title: string
  snippet: string
  matchCount: number
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await securityCheck(req, `search:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }
  // Cap query length to prevent excessive scanning across all paragraphs
  const maxQueryLen = 200
  const query = q.length > maxQueryLen ? q.slice(0, maxQueryLen) : q

  // Preserve the legacy 404 for a missing narrative.
  const exists = await db.narrative.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { results, total } = await searchNarrative({
    narrativeId: id,
    query,
    // Legacy UI groups strictly by paragraph/scene/character — never events.
    types: ['paragraph', 'scene', 'character'],
    limit: 50,
    offset: 0,
  })

  const mapped: LegacySearchResult[] = results.map((r) => ({
    type: r.type as LegacySearchResult['type'],
    refId: r.id,
    title: legacyTitle(r),
    snippet: legacySnippet(r),
    matchCount: r.matchCount,
  }))

  return NextResponse.json({ results: mapped, total })
}

// ─── Legacy shape mapping ──────────────────────────────────────────────────

function legacyTitle(r: SearchResultItem): string {
  const m = (r.metadata ?? {}) as {
    index?: number
    speaker?: string | null
  }
  if (r.type === 'paragraph') {
    const num = (m.index ?? 0) + 1
    return `¶ ${num}${m.speaker ? ` · ${m.speaker}` : ''}`
  }
  if (r.type === 'scene') {
    return `Scene ${(m.index ?? 0) + 1}`
  }
  // character
  return r.text
}

function legacySnippet(r: SearchResultItem): string {
  if (r.type === 'character') {
    const m = (r.metadata ?? {}) as {
      role?: string
      mentions?: number
      aliases?: string | null
    }
    const aliases = m.aliases && m.aliases !== '[]' ? ` · ${m.aliases}` : ''
    return `${m.role ?? ''} · ${m.mentions ?? 0} mentions${aliases}`
  }
  return r.highlight ?? r.text.slice(0, 120) + (r.text.length > 120 ? '…' : '')
}
