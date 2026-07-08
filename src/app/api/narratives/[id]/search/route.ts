/**
 * GET /api/narratives/[id]/search?q=query
 * Full-text search across scenes, paragraphs, and characters.
 * Returns matching snippets with context.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `search:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const narrative = await db.narrative.findUnique({
    where: { id },
    include: {
      paragraphs: { orderBy: { index: 'asc' } },
      scenes: { orderBy: { index: 'asc' } },
      characters: {},
    },
  })
  if (!narrative) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const results: Array<{
    type: 'paragraph' | 'scene' | 'character'
    refId: string
    title: string
    snippet: string
    matchCount: number
  }> = []

  const lowerQ = q.toLowerCase()
  const makeSnippet = (text: string, maxLen = 120): { snippet: string; count: number } => {
    const lower = text.toLowerCase()
    const idx = lower.indexOf(lowerQ)
    const count = lower.split(lowerQ).length - 1
    if (idx === -1) return { snippet: text.slice(0, maxLen) + (text.length > maxLen ? '…' : ''), count }
    const start = Math.max(0, idx - 40)
    const end = Math.min(text.length, idx + q.length + 60)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < text.length ? '…' : ''
    return { snippet: prefix + text.slice(start, end) + suffix, count }
  }

  // Search paragraphs
  for (const p of narrative.paragraphs) {
    if (p.text.toLowerCase().includes(lowerQ)) {
      const { snippet, count } = makeSnippet(p.text)
      results.push({
        type: 'paragraph',
        refId: p.id,
        title: `¶ ${p.index + 1}${p.speaker ? ` · ${p.speaker}` : ''}`,
        snippet,
        matchCount: count,
      })
    }
  }

  // Search scenes
  for (const s of narrative.scenes) {
    if ((s.summary || '').toLowerCase().includes(lowerQ) || (s.title || '').toLowerCase().includes(lowerQ)) {
      const { snippet, count } = makeSnippet(s.summary || s.title || '')
      results.push({
        type: 'scene',
        refId: s.id,
        title: `Scene ${s.index + 1}`,
        snippet,
        matchCount: count,
      })
    }
  }

  // Search characters
  for (const c of narrative.characters) {
    if (c.name.toLowerCase().includes(lowerQ)) {
      results.push({
        type: 'character',
        refId: c.id,
        title: c.name,
        snippet: `${c.role} · ${c.mentions} mentions${c.aliases && c.aliases !== '[]' ? ' · ' + c.aliases : ''}`,
        matchCount: 1,
      })
    }
  }

  // Sort by match count descending, limit to 50
  results.sort((a, b) => b.matchCount - a.matchCount)
  return NextResponse.json({ results: results.slice(0, 50), total: results.length })
}
