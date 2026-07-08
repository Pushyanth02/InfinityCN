/**
 * POST /api/documents/upload
 * Accepts PDF/DOCX/TXT, stores it, hashes it (dedup), creates Document + Job.
 * Security: rate limiting, MIME+extension+magic bytes validation, filename sanitization.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { saveBuffer, buildStorageName } from '@/lib/storage'
import { hashBuffer } from '@/lib/pipeline/extract'
import path from 'node:path'

const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown'])
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md'])

export async function POST(req: NextRequest) {
  try {
    const { securityCheck } = await import('@/lib/middleware/security')
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const blocked = securityCheck(req, `upload:${getClientIP(req)}`, 5)
    if (blocked) return blocked
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BYTES + 1024 * 64) return NextResponse.json({ error: 'File too large.' }, { status: 413 })

    const formData = await req.formData()
    const file = formData.get('file')
    const mode = (formData.get('mode') as string) || 'BOTH'
    const priority = Math.max(1, Math.min(10, parseInt(String(formData.get('priority') ?? '5'), 10) || 5))

    if (!file || !(file instanceof File)) return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    if (!['ORIGINAL', 'CINEMATIFIED', 'BOTH'].includes(mode)) return NextResponse.json({ error: 'Invalid mode.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large.' }, { status: 413 })

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_MIME.has(file.type || '') || !ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'Unsupported file type.' }, { status: 415 })

    const safeName = file.name.replace(/[\x00-\x1F\x7F\u202E\u200E\u200F]/g, '').replace(/[/\\]/g, '_').replace(/\.\./g, '_').slice(0, 255)
    if (!safeName || safeName === '.') return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 })

    const buf = Buffer.from(await file.arrayBuffer())
    if (!validateMagicBytes(buf, ext)) return NextResponse.json({ error: 'File content mismatch.' }, { status: 415 })

    const fileHash = hashBuffer(buf)

    let documentId: string
    const existing = await db.document.findFirst({ where: { fileHash }, select: { id: true } })
    if (existing) {
      documentId = existing.id
    } else {
      const storageName = buildStorageName(safeName, fileHash)
      try {
        await saveBuffer(storageName, buf)
        const doc = await db.document.create({ data: { originalName: safeName, storageName, mimeType: file.type || 'application/octet-stream', sizeBytes: buf.length, fileHash, status: 'UPLOADED' } })
        documentId = doc.id
      } catch (err) {
        // P2002 = unique constraint (fileHash) — a concurrent upload won the race.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const existingDoc = await db.document.findFirst({ where: { fileHash }, select: { id: true } })
          if (existingDoc) documentId = existingDoc.id
          else throw err
        } else throw err
      }
    }

    // Deduplicate: if a job for the same document+mode is already QUEUED or PROCESSING, return it (spec 2.14)
    const existingJob = await db.job.findFirst({
      where: {
        documentId,
        mode,
        status: { in: ['QUEUED', 'PROCESSING'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (existingJob) {
      return NextResponse.json({
        documentId,
        jobId: existingJob.id,
        mode,
        status: existingJob.status,
        message: 'Existing job in progress for this document and mode.',
        deduplicated: true,
      })
    }

    const job = await db.job.create({ data: { documentId, mode, status: 'QUEUED', progress: 0, stage: 'QUEUED', priority } })
    return NextResponse.json({ documentId, jobId: job.id, mode, status: 'QUEUED', message: 'Document uploaded. Processing will begin momentarily.' })
  } catch (err) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}

function validateMagicBytes(buf: Buffer, ext: string): boolean {
  if (buf.length < 4) return false
  if (ext === '.pdf') return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
  if (ext === '.docx') return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
  // For text files (.txt, .md): validate content is valid UTF-8 without binary data
  if (ext === '.txt' || ext === '.md') {
    return isValidUtf8Text(buf)
  }
  return true
}

/**
 * Validate that a buffer contains valid UTF-8 text without binary data.
 * Rejects files with NULL bytes or high proportion of non-printable characters.
 */
function isValidUtf8Text(buf: Buffer): boolean {
  // Check for NULL bytes (strong indicator of binary content)
  if (buf.includes(0x00)) return false

  // Attempt to decode as UTF-8 and check for replacement characters
  const text = buf.toString('utf-8')
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  // If more than 0.1% of characters are replacement chars, it's likely binary
  if (text.length > 0 && replacementCount / text.length > 0.001) return false

  // Check for excessive control characters (excluding common whitespace)
  let controlCount = 0
  const sampleSize = Math.min(text.length, 4096)
  for (let i = 0; i < sampleSize; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
      controlCount++
    }
  }
  if (sampleSize > 0 && controlCount / sampleSize > 0.01) return false

  return true
}
