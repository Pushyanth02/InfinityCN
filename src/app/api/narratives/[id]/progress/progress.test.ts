/**
 * Regression tests for reading-progress persistence.
 *
 * Guards the P2003 foreign-key failure fixed in v1.1: posting progress for a
 * narrative id that does not exist (stale client state, deleted narrative)
 * previously crashed the upsert with a Prisma P2003 500. It must now return a
 * clean 404 and never violate the ReadingProgress → Narrative foreign key.
 *
 * Integration test — runs against the dev SQLite database (same pattern as the
 * e2e pipeline test). Creates and tears down its own rows.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { GET, POST } from './route'

// Mirror the auth/CSRF headers the e2e test uses so securityCheck passes
// whether or not LEMNISCATE_API_KEY / allowlist are configured.
const API_KEY = process.env.LEMNISCATE_API_KEY
const allowedOrigin = (process.env.LEMNISCATE_ALLOWED_ORIGINS || '').split(',')[0].trim()
const authHeaders: Record<string, string> = { 'content-type': 'application/json' }
if (API_KEY) authHeaders['x-api-key'] = API_KEY
if (allowedOrigin) authHeaders['origin'] = allowedOrigin

const createdDocumentIds: string[] = []

afterAll(async () => {
  // Cascade delete removes jobs, narratives, and reading progress.
  for (const id of createdDocumentIds) {
    await db.document.delete({ where: { id } }).catch(() => {})
  }
})

function postProgress(narrativeId: string, body: Record<string, unknown>) {
  const req = new NextRequest(
    `http://localhost:3000/api/narratives/${narrativeId}/progress`,
    { method: 'POST', headers: authHeaders, body: JSON.stringify(body) },
  )
  return POST(req, { params: Promise.resolve({ id: narrativeId }) })
}

async function seedNarrative(): Promise<string> {
  const doc = await db.document.create({
    data: {
      originalName: 'progress-test.txt',
      storageName: `progress-test-${Date.now()}.txt`,
      mimeType: 'text/plain',
      sizeBytes: 10,
      fileHash: `progress-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      status: 'PROCESSED',
    },
  })
  createdDocumentIds.push(doc.id)
  const job = await db.job.create({
    data: { documentId: doc.id, mode: 'ORIGINAL', status: 'COMPLETED', progress: 100 },
  })
  const narrative = await db.narrative.create({
    data: {
      documentId: doc.id,
      jobId: job.id,
      mode: 'ORIGINAL',
      title: 'Progress Test Narrative',
      content: 'Body.',
      plainText: 'Body.',
      wordCount: 1,
      charCount: 5,
      readingTimeMin: 1,
      paragraphCount: 1,
    },
  })
  return narrative.id
}

describe('[integration] POST progress — foreign key safety (P2003 regression)', () => {
  it('returns 404 (not 500) for a well-formed but non-existent narrative id', async () => {
    // Valid CUID shape so it passes validateIdParam and reaches the DB layer.
    const ghostId = 'c' + 'a'.repeat(24)
    const res = await postProgress(ghostId, { scrollPct: 50 })
    expect(res.status).toBe(404)
    // And crucially, no orphaned ReadingProgress row was created.
    const orphan = await db.readingProgress.findUnique({ where: { narrativeId: ghostId } })
    expect(orphan).toBeNull()
  })
})

describe('[integration] progress upsert — happy path', () => {
  it('persists and reads back progress for an existing narrative', async () => {
    const narrativeId = await seedNarrative()

    const postRes = await postProgress(narrativeId, { scrollPct: 42, sceneIndex: 2, paragraphIdx: 7 })
    expect(postRes.status).toBe(200)

    const getReq = new NextRequest(
      `http://localhost:3000/api/narratives/${narrativeId}/progress`,
      { headers: authHeaders },
    )
    const getRes = await GET(getReq, { params: Promise.resolve({ id: narrativeId }) })
    const body = (await getRes.json()) as {
      progress: { scrollPct: number; sceneIndex: number; paragraphIdx: number } | null
    }
    expect(body.progress?.scrollPct).toBe(42)
    expect(body.progress?.paragraphIdx).toBe(7)
  })

  it('clamps scrollPct into 0..100', async () => {
    const narrativeId = await seedNarrative()
    const res = await postProgress(narrativeId, { scrollPct: 999 })
    const body = (await res.json()) as { progress: { scrollPct: number } }
    expect(res.status).toBe(200)
    expect(body.progress.scrollPct).toBe(100)
  })

  it('returns 404 after the narrative is deleted (stale client state)', async () => {
    const narrativeId = await seedNarrative()
    await db.narrative.delete({ where: { id: narrativeId } })
    const res = await postProgress(narrativeId, { scrollPct: 30 })
    expect(res.status).toBe(404)
  })
})
