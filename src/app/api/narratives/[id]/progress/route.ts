/**
 * GET  /api/narratives/[id]/progress — get reading progress
 * POST /api/narratives/[id]/progress — upsert reading progress
 *   body: { scrollPct, sceneIndex, paragraphIdx }
 */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { validateIdParam } from '@/lib/middleware/validate-id'
import { enforceBodySize } from '@/lib/middleware/body-size'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid
  const progress = await db.readingProgress.findUnique({ where: { narrativeId: id } })
  return NextResponse.json({ progress })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = securityCheck(req, `progress:${getClientIP(req)}`, 30)
  if (blocked) return blocked
  const tooLarge = enforceBodySize(req)
  if (tooLarge) return tooLarge

  const { id } = await ctx.params
  const invalid = validateIdParam(id, 'narrativeId')
  if (invalid) return invalid

  let body: ProgressBody
  try {
    body = (await req.json()) as ProgressBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const scrollPct = clamp(toInt(body.scrollPct), 0, 100)
  const sceneIndex = Math.max(0, toInt(body.sceneIndex))
  const paragraphIdx = Math.max(0, toInt(body.paragraphIdx))

  // Guard the foreign key: the client may hold a stale narrative id (e.g. the
  // narrative was deleted in another tab). Verify existence before the upsert
  // so a missing parent yields a clean 404 instead of a Prisma P2003 crash.
  const narrative = await db.narrative.findUnique({ where: { id }, select: { id: true } })
  if (!narrative) {
    return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
  }

  try {
    const progress = await db.readingProgress.upsert({
      where: { narrativeId: id },
      create: { narrativeId: id, scrollPct, sceneIndex, paragraphIdx },
      update: { scrollPct, sceneIndex, paragraphIdx },
    })
    return NextResponse.json({ progress })
  } catch (err) {
    // Race: narrative deleted between the existence check and the write.
    // P2003 = foreign key constraint violation. Treat as a benign no-op
    // rather than surfacing a 500 for progress that no longer has a home.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return NextResponse.json({ error: 'Narrative not found' }, { status: 404 })
    }
    throw err
  }
}

interface ProgressBody {
  scrollPct?: number
  sceneIndex?: number
  paragraphIdx?: number
}

function toInt(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}
