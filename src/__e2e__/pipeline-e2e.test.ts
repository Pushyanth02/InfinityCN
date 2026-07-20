/**
 * Lemniscate — End-to-End Pipeline Verification (temporary integration test)
 * ----------------------------------------------------------------------------
 * Exercises the REAL production code paths against the dev database:
 *   upload route → worker claim → job-runner retry → orchestrator →
 *   extraction → original → cinematified → persistence → narratives GET.
 *
 * Run explicitly:  bunx vitest run src/__e2e__/pipeline-e2e.test.ts
 * Writes a human-readable transcript to e2e-report.txt.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import fs from 'node:fs/promises'
import { db } from '@/lib/db'
import { uploadPath } from '@/lib/storage'
import { claimNextJob, executeJobWithRetry } from '@/lib/pipeline/job-runner'

const lines: string[] = []
const log = (s = '') => { lines.push(s) }

const SAMPLE = `The Lantern of Veyrn

Chapter One

Elara climbed the winding stairs of the old lighthouse. The sea below was dark and restless. She had not slept in three days.

"You should not have come," Marin said, stepping from the shadows. His voice was low and tired.

Elara turned to face him. "The lantern must be lit tonight," Elara replied. "The ships depend on it."

Chapter Two

Later, they reached the harbor. A storm was rising over the water. Waves crashed against the stone pier and the wind screamed through the ropes.

Corin ran toward them, breathless. "A ship struck the reef," Corin shouted. "The crew is drowning."

Marin grabbed a heavy rope and rushed to the edge. He pulled a frozen sailor from the churning waves.

Chapter Three

That night, in the tower, they lit the great lantern. Its light swept across the ocean like a blade. Elara wept with relief and joy.

"We saved them," Corin whispered. "We truly saved them."

Chapter Four

The next morning, the village gathered on the shore. They thanked Elara and Marin for their courage. The danger had passed, and peace returned to Veyrn at last.

Archive reference ${Date.now()}.`

describe('[e2e] upload → process → read — full pipeline happy path', () => {
  it('runs the complete production pipeline and produces both narratives', async () => {
    log('================ LEMNISCATE E2E VERIFICATION ================')
    log(`started: ${new Date().toISOString()}`)
    log('')

    // ── 1. sample document ──────────────────────────────────────────────
    const buf = Buffer.from(SAMPLE, 'utf-8')
    log(`[1]  SAMPLE           txt, ${buf.length} bytes`)
    expect(buf.length).toBeGreaterThan(0)

    // ── 2. UPLOAD via the real route handler ────────────────────────────
    // Prisma loads .env into process.env; if LEMNISCATE_API_KEY is configured,
    // the route enforces auth (verified working — a keyless request gets 401).
    const API_KEY = process.env.LEMNISCATE_API_KEY
    const allowedOrigin = (process.env.LEMNISCATE_ALLOWED_ORIGINS || '').split(',')[0].trim()
    const authHeaders: Record<string, string> = {}
    if (API_KEY) authHeaders['x-api-key'] = API_KEY
    if (allowedOrigin) authHeaders['origin'] = allowedOrigin
    log(`[auth] api-key ${API_KEY ? 'configured' : 'off'}; csrf allowlist ${allowedOrigin ? `enforced (origin=${allowedOrigin})` : 'off'}`)
    const { POST: uploadPOST } = await import('@/app/api/documents/upload/route')
    const form = new FormData()
    form.append('file', new File([buf], 'lantern-of-veyrn.txt', { type: 'text/plain' }))
    form.append('mode', 'BOTH')
    const uploadReq = new NextRequest('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      headers: authHeaders,
      body: form as unknown as BodyInit,
    })
    const uploadRes = await uploadPOST(uploadReq)
    const uploadBody = await uploadRes.json() as { documentId: string; jobId: string; status: string }
    log(`[2]  UPLOAD/VALIDATE  http=${uploadRes.status} ${JSON.stringify(uploadBody)}`)
    expect(uploadRes.status).toBe(200)
    const { documentId, jobId } = uploadBody

    // ── 3. STORAGE + DB records ─────────────────────────────────────────
    const doc = await db.document.findUnique({ where: { id: documentId } })
    const stored = doc ? await fs.stat(uploadPath(doc.storageName)).then((s) => s.size).catch(() => -1) : -1
    log(`[3]  STORAGE/DOC      status=${doc?.status} stored=${stored}B name="${doc?.originalName}" hash=${doc?.fileHash?.slice(0, 12)}`)
    expect(doc).toBeTruthy()
    expect(stored).toBe(buf.length)

    const queuedJob = await db.job.findUnique({ where: { id: jobId } })
    log(`[4]  QUEUE           job=${jobId} status=${queuedJob?.status} mode=${queuedJob?.mode} prio=${queuedJob?.priority}`)
    expect(queuedJob?.status).toBe('QUEUED')

    // ── 5. WORKER claims + runs (exact production worker path) ───────────
    const claim = await claimNextJob()
    log(`[5]  CLAIM           claimed=${claim?.jobId} mode=${claim?.mode}`)
    expect(claim?.jobId).toBe(jobId)
    await executeJobWithRetry(claim!, '[e2e]')

    // ── 6/7. job status + processing stages ─────────────────────────────
    const job = await db.job.findUnique({ where: { id: jobId } })
    log(`[6]  JOB STATUS      status=${job?.status} stage=${job?.stage} progress=${job?.progress} duration=${job?.durationMs}ms error=${job?.error ?? 'none'}`)
    expect(job?.status).toBe('COMPLETED')
    expect(job?.progress).toBe(100)

    const plogs = await db.processingLog.findMany({ where: { jobId }, orderBy: { timestamp: 'asc' } })
    const stageSeq = plogs.map((l) => l.stage)
    log(`[7]  STAGES          ${stageSeq.join(' → ')}`)
    for (const s of ['EXTRACT', 'ORIGINAL', 'CINEMATIFY', 'FINALIZE']) expect(stageSeq).toContain(s)
    const errorLogs = plogs.filter((l) => l.level === 'ERROR')
    log(`     exceptions: ${errorLogs.length === 0 ? 'none' : errorLogs.map((l) => l.message).join(' | ')}`)
    expect(errorLogs.length).toBe(0)

    // ── 8. narratives ───────────────────────────────────────────────────
    const narratives = await db.narrative.findMany({ where: { documentId }, orderBy: { createdAt: 'asc' } })
    const original = narratives.find((n) => n.mode === 'ORIGINAL')!
    const cinema = narratives.find((n) => n.mode === 'CINEMATIFIED')!
    log(`[8]  NARRATIVES      ${narratives.map((n) => `${n.mode}(words=${n.wordCount},paras=${n.paragraphCount},scenes=${n.sceneCount})`).join('  ')}`)
    expect(original).toBeTruthy()
    expect(cinema).toBeTruthy()

    // ── 9/10/11. cinematified analysis ──────────────────────────────────
    const scenes = await db.scene.findMany({ where: { narrativeId: cinema.id }, orderBy: { index: 'asc' } })
    const chars = await db.character.findMany({ where: { narrativeId: cinema.id }, orderBy: { mentions: 'desc' } })
    const locs = await db.location.findMany({ where: { narrativeId: cinema.id } })
    const events = await db.event.count({ where: { narrativeId: cinema.id } })
    const arcs = await db.narrativeArc.count({ where: { narrativeId: cinema.id } })
    const peaks = await db.emotionalPeak.count({ where: { narrativeId: cinema.id } })
    log(`[9]  SCENE DETECT    ${scenes.length} scenes`)
    log(`[10] CHAR DETECT     ${chars.map((c) => `${c.name}:${c.role}(${c.mentions})`).join(', ')}`)
    log(`[11] NARRATIVE ANLZ  ${locs.length} locations, ${events} events, ${arcs} arcs, ${peaks} peaks`)
    expect(scenes.length).toBeGreaterThan(0)
    expect(chars.length).toBeGreaterThan(0)
    expect(events).toBeGreaterThan(0)

    // ── 12. FIDELITY — Original preserves wording ───────────────────────
    const srcSet = new Set(SAMPLE.toLowerCase().match(/[a-z]+/g) || [])
    const origSet = new Set(original.plainText.toLowerCase().match(/[a-z]+/g) || [])
    const missing = [...srcSet].filter((w) => !origSet.has(w))
    log(`[12] ORIGINAL MEANING source unique words=${srcSet.size}; missing from original=${missing.length} ${missing.length ? '[' + missing.slice(0, 12).join(', ') + ']' : ''}`)
    expect(missing.length).toBe(0)

    // ── 13. FIDELITY — Cinematified invents nothing ─────────────────────
    const inventedChars = chars.filter((c) => !SAMPLE.includes(c.name))
    const origParaTexts = new Set((await db.paragraph.findMany({ where: { narrativeId: original.id } })).map((p) => p.text))
    const cinemaParas = await db.paragraph.findMany({ where: { narrativeId: cinema.id } })
    const inventedParas = cinemaParas.filter((p) => !origParaTexts.has(p.text))
    log(`[13] NO INVENTION    invented chars=${inventedChars.length} ${inventedChars.map((c) => c.name).join(',')}; invented paragraphs=${inventedParas.length}`)
    expect(inventedChars.length).toBe(0)
    expect(inventedParas.length).toBe(0)

    // ── 14. READER data contract via the real narratives GET route ──────
    const { GET: narrativeGET } = await import('@/app/api/narratives/[id]/route')
    const readReq = new NextRequest(`http://localhost:3000/api/narratives/${cinema.id}?sceneLimit=100&paraLimit=500`, { headers: authHeaders })
    const readRes = await narrativeGET(readReq, { params: Promise.resolve({ id: cinema.id }) })
    const readBody = await readRes.json() as { narrative?: { scenes?: Array<{ paragraphs?: unknown[] }> } }
    const totalScenes = (readBody.narrative?.scenes || []).length
    const scenesWithText = (readBody.narrative?.scenes || []).filter((s) => (s.paragraphs || []).length > 0).length
    log(`[14] READER CONTRACT http=${readRes.status} scenes=${totalScenes}, scenes-with-source-text=${scenesWithText}`)
    expect(readRes.status).toBe(200)
    expect(totalScenes).toBeGreaterThan(0)
    expect(scenesWithText).toBe(totalScenes) // regression guard for the pagination bug fix

    // ── outputs ─────────────────────────────────────────────────────────
    log('')
    log('================ ORIGINAL MODE OUTPUT ================')
    log(original.content)
    log('')
    log('================ CINEMATIFIED MODE OUTPUT ================')
    log(cinema.content)
    log('')
    log('================ END ================')

    await fs.writeFile('e2e-report.txt', lines.join('\n'), 'utf-8')
  }, 60_000)
})
