/**
 * GET /api/narratives/[id] — full narrative with all analysis artifacts.
 *
 * For CINEMATIFIED narratives, each scene includes its source `paragraphs`
 * (filtered by offset range) so the screenplay view can render verbatim text.
 *
 * Optional ?view=summary — lightweight payload (counts + metadata only).
 * Supports pagination for paragraphs/scenes via ?paraLimit=50&paraOffset=0&sceneLimit=50&sceneOffset=0
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `narrative:${getClientIP(req)}`, 60)
  if (blocked) return blocked

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid

  const view = req.nextUrl.searchParams.get('view') || 'all'
  const paraLimit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('paraLimit') || '50', 10) || 50))
  const paraOffset = Math.max(0, parseInt(req.nextUrl.searchParams.get('paraOffset') || '0', 10) || 0)
  const sceneLimit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('sceneLimit') || '50', 10) || 50))
  const sceneOffset = Math.max(0, parseInt(req.nextUrl.searchParams.get('sceneOffset') || '0', 10) || 0)

  const narrative = await db.narrative.findUnique({
    where: { id },
    include: {
      document: { select: { id: true, originalName: true, status: true } },
      paragraphs: { orderBy: { index: 'asc' }, take: paraLimit, skip: paraOffset },
      // Don't double-load events at the top level — they're included per-scene.
      scenes: { orderBy: { index: 'asc' }, take: sceneLimit, skip: sceneOffset, include: { events: { orderBy: { index: 'asc' } } } },
      characters: { orderBy: { mentions: 'desc' } },
      locations: { orderBy: { mentions: 'desc' } },
      arcs: { orderBy: { startSceneIdx: 'asc' } },
      peaks: { orderBy: { intensity: 'desc' }, take: 50 },
    },
  })
  if (!narrative) return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })

  if (view === 'summary') {
    return NextResponse.json({
      narrative: {
        id: narrative.id,
        title: narrative.title,
        mode: narrative.mode,
        wordCount: narrative.wordCount,
        charCount: narrative.charCount,
        readingTimeMin: narrative.readingTimeMin,
        paragraphCount: narrative.paragraphCount,
        sceneCount: narrative.sceneCount,
        createdAt: narrative.createdAt,
        document: narrative.document,
        metadata: narrative.metadata,
      },
    })
  }

  // Attach source paragraphs to each returned scene by offset range.
  //
  // IMPORTANT: scene paragraphs are loaded with a dedicated query bounded to
  // the returned scenes' offset span — NOT from the paginated top-level
  // `paragraphs` window. Previously the code filtered `narrative.paragraphs`
  // (limited to `paraLimit`, default 50), so any scene whose source text fell
  // outside the first page rendered EMPTY in the screenplay view. This query
  // is bounded by the returned scene window (`sceneLimit`), keeping it cheap.
  const sceneList = narrative.scenes
  let sceneParagraphs: typeof narrative.paragraphs = []
  if (sceneList.length > 0) {
    const minStart = Math.min(...sceneList.map((s) => s.startOffset))
    const maxEnd = Math.max(...sceneList.map((s) => s.endOffset))
    sceneParagraphs = await db.paragraph.findMany({
      where: { narrativeId: id, startOffset: { gte: minStart, lte: maxEnd } },
      orderBy: { index: 'asc' },
    })
  }
  const scenesWithParas = sceneList.map((scene) => ({
    ...scene,
    paragraphs: sceneParagraphs.filter(
      (p) => p.startOffset >= scene.startOffset && p.startOffset <= scene.endOffset,
    ),
  }))

  // Flatten events from scenes for the events tab (avoids a second DB query
  // and the duplicate-load problem).
  const events = scenesWithParas.flatMap((s) => s.events)

  return NextResponse.json({
    narrative: {
      ...narrative,
      scenes: scenesWithParas,
      events,
    },
    pagination: {
      paragraphs: { limit: paraLimit, offset: paraOffset },
      scenes: { limit: sceneLimit, offset: sceneOffset },
    },
  })
}
