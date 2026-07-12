/**
 * Lemniscate — Document Service
 * ----------------------------------------------------------------------------
 * Business logic for document lifecycle: upload, list, get, delete.
 * Encapsulates validation, storage, deduplication, and job creation.
 *
 * API routes call this service instead of touching Prisma directly.
 */

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { hashBuffer } from '@/lib/pipeline/extract'
import { getStorageProvider } from '@/lib/providers'
import { createLogger } from '@/lib/logger'
import {
  ValidationError,
  UnsupportedMediaTypeError,
  PayloadTooLargeError,
  NotFoundError,
} from '@/lib/domain/errors'
import type { JobMode } from '@/lib/domain/enums'

const logger = createLogger('document-service')

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const MAX_BYTES = parseMaxUploadBytes(process.env.MAX_UPLOAD_BYTES, DEFAULT_MAX_BYTES)
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
])
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md'])

// ─── Types ────────────────────────────────────────────────────────────────

export interface UploadInput {
  fileName: string
  mimeType: string
  fileBuffer: Buffer
  fileSize: number
  mode: JobMode
  priority: number
}

export interface UploadResult {
  documentId: string
  jobId: string
  mode: JobMode
  status: string
  deduplicated: boolean
  message: string
}

export interface DocumentListOptions {
  status?: string
  documentType?: string
  limit: number
  offset: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Upload a document: validate → store → dedup → create job.
 */
export async function uploadDocument(input: UploadInput): Promise<UploadResult> {
  const { fileName, mimeType, fileBuffer, fileSize, mode, priority } = input

  // Validate file size
  if (fileSize > MAX_BYTES) {
    throw new PayloadTooLargeError(`File exceeds maximum size of ${MAX_BYTES / (1024 * 1024)}MB`)
  }

  // Validate MIME type and extension
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_MIME.has(mimeType) || !ALLOWED_EXT.has(ext)) {
    throw new UnsupportedMediaTypeError(
      `Unsupported file type: ${mimeType || 'unknown'} (${ext}). Supported: PDF, DOCX, TXT, MD.`,
    )
  }

  // Validate magic bytes
  if (!validateMagicBytes(fileBuffer, ext)) {
    throw new UnsupportedMediaTypeError('File content does not match the declared type.')
  }

  // Sanitize filename
  const safeName = sanitizeFileName(fileName)
  if (!safeName || safeName === '.') {
    throw new ValidationError('Invalid filename.')
  }

  // Hash for deduplication
  const fileHash = hashBuffer(fileBuffer)

  let documentId: string

  // Check for existing document (dedup by hash)
  const existing = await db.document.findFirst({
    where: { fileHash },
    select: { id: true },
  })

  if (existing) {
    documentId = existing.id
  } else {
    const { buildStorageName } = await import('@/lib/storage')
    const storageName = buildStorageName(safeName, fileHash)
    const storage = await getStorageProvider()
    let stored = false
    try {
      await storage.save(storageName, fileBuffer)
      stored = true

      const doc = await db.document.create({
        data: {
          originalName: safeName,
          storageName,
          mimeType: mimeType || 'application/octet-stream',
          sizeBytes: fileBuffer.length,
          fileHash,
          status: 'UPLOADED',
        },
      })
      documentId = doc.id
    } catch (err) {
      if (stored) {
        await storage.delete(storageName).catch((deleteErr: unknown) => {
          logger.warn('Failed to clean up orphaned upload file', {
            storageName,
            error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
          })
        })
      }
      // P2002 = unique constraint (fileHash) — concurrent upload won the race
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existingDoc = await db.document.findFirst({
          where: { fileHash },
          select: { id: true },
        })
        if (existingDoc) documentId = existingDoc.id
        else throw err
      } else {
        throw err
      }
    }
  }

  // Deduplicate: if a job for the same document+mode is already QUEUED/PROCESSING
  const existingJob = await db.job.findFirst({
    where: {
      documentId,
      mode,
      status: { in: ['QUEUED', 'PROCESSING'] },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existingJob) {
    return {
      documentId,
      jobId: existingJob.id,
      mode,
      status: existingJob.status,
      message: 'Existing job in progress for this document and mode.',
      deduplicated: true,
    }
  }

  // Create processing job
  const job = await db.job.create({
    data: {
      documentId,
      mode,
      status: 'QUEUED',
      progress: 0,
      stage: 'QUEUED',
      priority,
    },
  })

  logger.info('Document uploaded and job queued', {
    documentId,
    jobId: job.id,
    mode,
    fileName: safeName,
  })

  return {
    documentId,
    jobId: job.id,
    mode,
    status: 'QUEUED',
    message: 'Document uploaded. Processing will begin momentarily.',
    deduplicated: false,
  }
}

/**
 * List documents with optional filtering, sorting, and pagination.
 */
export async function listDocuments(options: DocumentListOptions) {
  const where: Prisma.DocumentWhereInput = {}
  if (options.status) where.status = options.status
  if (options.documentType) where.documentType = options.documentType

  const orderBy: Prisma.DocumentOrderByWithRelationInput = {}
  const sortBy = options.sortBy || 'createdAt'
  const sortOrder = options.sortOrder || 'desc'
  if (sortBy === 'createdAt' || sortBy === 'originalName' || sortBy === 'sizeBytes' || sortBy === 'documentType') {
    orderBy[sortBy] = sortOrder
  }

  const [documents, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy,
      take: options.limit,
      skip: options.offset,
      include: {
        _count: { select: { jobs: true, narratives: true } },
        jobs: {
          select: { id: true, mode: true, status: true, progress: true, stage: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    }),
    db.document.count({ where }),
  ])

  return { documents, total }
}

/**
 * Get a single document by ID with its jobs and narratives.
 */
export async function getDocument(id: string) {
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      rawText: { select: { wordCount: true, charCount: true, language: true } },
      jobs: {
        select: { id: true, mode: true, status: true, progress: true, stage: true, createdAt: true, completedAt: true },
        orderBy: { createdAt: 'desc' },
      },
      narratives: {
        select: { id: true, mode: true, title: true, sceneCount: true, wordCount: true, readingTimeMin: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!doc) throw new NotFoundError(`Document '${id}' not found`)
  return doc
}

/**
 * Delete a document and cascade-delete all related data.
 */
export async function deleteDocument(id: string): Promise<void> {
  const doc = await db.document.findUnique({
    where: { id },
    select: { storageName: true },
  })
  if (!doc) throw new NotFoundError(`Document '${id}' not found`)

  // Delete the file from storage
  try {
    const storage = await getStorageProvider()
    await storage.delete(doc.storageName)
  } catch (err) {
    logger.warn('Failed to delete document file', { documentId: id, error: (err as Error).message })
  }

  // Prisma cascade handles Job, Narrative, Paragraph, Scene, etc.
  await db.document.delete({ where: { id } })

  logger.info('Document deleted', { documentId: id })
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F\u202E\u200E\u200F]/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .slice(0, 255)
}

function validateMagicBytes(buf: Buffer, ext: string): boolean {
  if (ext === '.txt' || ext === '.md') return buf.length > 0 && isValidUtf8Text(buf)
  if (buf.length < 4) return false
  if (ext === '.pdf') return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
  if (ext === '.docx') return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
  if (ext === '.doc') {
    return (
      buf.length >= 8 &&
      buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0 &&
      buf[4] === 0xA1 && buf[5] === 0xB1 && buf[6] === 0x1A && buf[7] === 0xE1
    )
  }
  return false
}

function parseMaxUploadBytes(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isValidUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0x00)) return false
  const text = buf.toString('utf-8')
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  if (text.length > 0 && replacementCount / text.length > 0.001) return false
  let controlCount = 0
  const sampleSize = Math.min(text.length, 4096)
  for (let i = 0; i < sampleSize; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) controlCount++
  }
  if (sampleSize > 0 && controlCount / sampleSize > 0.01) return false
  return true
}
