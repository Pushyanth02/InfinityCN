/**
 * Lemniscate — Processing Service
 * ----------------------------------------------------------------------------
 * Formal service layer for the document processing pipeline. Wraps the
 * orchestrator and job-runner behind a clean service interface that API routes
 * and other services consume.
 *
 * This service coordinates: extraction → segmentation → narrative analysis
 * → relationship analysis → persistence → completion.
 */

import { db } from '@/lib/db'
import { claimNextJob, rehydrateStalledJobs, executeJobWithRetry } from '@/lib/pipeline/job-runner'
import { createLogger } from '@/lib/logger'
import { NotFoundError, ValidationError } from '@/lib/domain/errors'

const logger = createLogger('processing-service')

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProcessingStatus {
  jobId: string
  status: string
  progress: number
  stage: string | null
  error: string | null
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Claim and process the next available queued job (non-blocking).
 * Used by the embedded poller and the standalone worker.
 */
export async function processNextJob(): Promise<boolean> {
  const claim = await claimNextJob()
  if (!claim) return false

  // Fire-and-forget: the job runs in the background.
  executeJobWithRetry(claim, '[processing-service]').catch((err) => {
    logger.error('Background job execution failed', {
      jobId: claim.jobId,
      error: (err as Error).message,
    })
  })
  return true
}

/**
 * Re-hydrate stalled processing jobs (called on startup).
 */
export async function recoverStalledJobs(staleThresholdMs?: number): Promise<number> {
  return rehydrateStalledJobs(staleThresholdMs)
}

/**
 * Cancel a queued or processing job.
 */
export async function cancelJob(jobId: string): Promise<void> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } })
  if (!job) throw new NotFoundError(`Job '${jobId}' not found`)

  if (job.status === 'CANCELLED') {
    return // Already cancelled — idempotent
  }
  if (job.status !== 'QUEUED' && job.status !== 'PROCESSING') {
    throw new ValidationError('Job is not in a cancellable state')
  }

  const result = await db.job.updateMany({
    where: { id: jobId, status: { in: ['QUEUED', 'PROCESSING'] } },
    data: {
      status: 'CANCELLED',
      stage: 'CANCELLED',
      error: 'Cancelled by user',
      completedAt: new Date(),
    },
  })
  if (result.count === 0) throw new ValidationError('Job is not in a cancellable state')
  logger.info('Job cancelled', { jobId })
}

/**
 * Get the current processing status of a job.
 */
export async function getProcessingStatus(jobId: string): Promise<ProcessingStatus> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, progress: true, stage: true, error: true },
  })
  if (!job) throw new NotFoundError(`Job '${jobId}' not found`)

  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    error: job.error,
  }
}

/**
 * Re-prioritize a queued job.
 */
export async function reprioritizeJob(jobId: string, priority: number): Promise<void> {
  if (priority < 1 || priority > 10) {
    throw new ValidationError('Priority must be between 1 and 10')
  }

  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } })
  if (!job) throw new NotFoundError(`Job '${jobId}' not found`)

  if (job.status !== 'QUEUED') {
    throw new ValidationError('Can only re-prioritize queued jobs')
  }

  await db.job.update({ where: { id: jobId }, data: { priority } })
  logger.info('Job re-prioritized', { jobId, priority })
}
