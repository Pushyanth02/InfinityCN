/**
 * Lemniscate — Job Service
 * ----------------------------------------------------------------------------
 * Business logic for job status, logs, and dead-letter management.
 */

import { db } from '@/lib/db'
import { getQueueProvider } from '@/lib/providers'
import { NotFoundError } from '@/lib/domain/errors'

// ─── Types ────────────────────────────────────────────────────────────────

export interface JobListOptions {
  status?: string
  documentId?: string
  limit: number
  offset: number
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Get a single job by ID with its narratives.
 */
export async function getJob(id: string) {
  const job = await db.job.findUnique({
    where: { id },
    include: {
      narratives: {
        select: {
          id: true,
          mode: true,
          title: true,
          sceneCount: true,
          wordCount: true,
          readingTimeMin: true,
          paragraphCount: true,
          createdAt: true,
        },
      },
    },
  })
  if (!job) throw new NotFoundError(`Job '${id}' not found`)
  return job
}

/**
 * Get processing logs for a job.
 */
export async function getJobLogs(
  jobId: string,
  options: { limit?: number; offset?: number; level?: string } = {},
) {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50))
  const offset = Math.max(0, options.offset ?? 0)
  const where: { jobId: string; level?: string } = { jobId }
  if (options.level) where.level = options.level

  const [logs, total] = await Promise.all([
    db.processingLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
      skip: offset,
    }),
    db.processingLog.count({ where }),
  ])

  return { logs, total }
}

/**
 * List dead-letter jobs with optional pagination.
 */
export async function listDeadLetterJobs(
  options: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50))
  const offset = Math.max(0, options.offset ?? 0)

  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where: { status: 'DEAD_LETTER' },
      include: {
        document: { select: { id: true, originalName: true } },
        narratives: { select: { id: true, mode: true, title: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.job.count({ where: { status: 'DEAD_LETTER' } }),
  ])

  return { jobs, total }
}

/**
 * Retry a dead-lettered job.
 */
export async function retryDeadLetterJob(jobId: string) {
  const queue = await getQueueProvider()
  const success = await queue.retryDeadLetter(jobId)
  if (!success) throw new NotFoundError(`Dead-letter job '${jobId}' not found`)
  return { jobId, status: 'QUEUED', message: 'Job re-queued for processing.' }
}

// ─── Health ───────────────────────────────────────────────────────────────

export interface HealthStatus {
  ok: boolean
  status: 'healthy' | 'degraded'
  database: 'connected' | 'disconnected'
  latencyMs?: number
  version: string
  timestamp: string
}

/**
 * Check system health: database connectivity and response latency.
 */
export async function checkHealth(): Promise<HealthStatus> {
  const start = Date.now()
  try {
    // Lightweight DB probe
    await db.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start
    return {
      ok: true,
      status: 'healthy',
      database: 'connected',
      latencyMs,
      version: process.env.npm_package_version || '0.2.0',
      timestamp: new Date().toISOString(),
    }
  } catch {
    return {
      ok: false,
      status: 'degraded',
      database: 'disconnected',
      version: process.env.npm_package_version || '0.2.0',
      timestamp: new Date().toISOString(),
    }
  }
}