/**
 * Lemniscate — Shared Job Runner
 * ----------------------------------------------------------------------------
 * Extracted CAS-claim logic and pipeline execution with exponential backoff
 * retry. Used by both the embedded poller and the standalone worker.
 *
 * Eliminates duplication (bug 1.14) and adds retry logic (bug 1.13).
 */

import { db } from '@/lib/db'
import { eventBus } from '@/lib/events/bus'
import { createLogger } from '@/lib/logger'

const logger = createLogger('job-runner')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_RETRIES = parseInt(process.env.WORKER_MAX_RETRIES || '3', 10)
const BASE_DELAY_MS = 1000
const JOB_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export type JobMode = 'ORIGINAL' | 'CINEMATIFIED' | 'BOTH'

export interface ClaimResult {
  jobId: string
  documentId: string
  mode: JobMode
}

// ---------------------------------------------------------------------------
// CAS-style Job Claiming
// ---------------------------------------------------------------------------

/**
 * Atomically claim the next available QUEUED job. Returns null if no job
 * is available or if another worker claimed it first (CAS failure).
 */
export async function claimNextJob(): Promise<ClaimResult | null> {
  const job = await db.job.findFirst({
    where: { status: 'QUEUED' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })
  if (!job) return null

  // CAS-style claim: only update if still QUEUED
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: 'QUEUED' },
    data: { status: 'PROCESSING', startedAt: new Date() },
  })
  if (claimed.count === 0) return null

  return {
    jobId: job.id,
    documentId: job.documentId,
    mode: job.mode as JobMode,
  }
}

// ---------------------------------------------------------------------------
// Re-hydrate Stalled Jobs
// ---------------------------------------------------------------------------

/**
 * Re-queue PROCESSING jobs whose startedAt is older than the stale threshold.
 * Uses atomic CAS (updateMany with status condition) to prevent race conditions
 * when multiple workers restart simultaneously (spec 2.17).
 */
export async function rehydrateStalledJobs(staleThresholdMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleThresholdMs)
  const stalled = await db.job.findMany({
    where: { status: 'PROCESSING', startedAt: { lt: cutoff } },
    select: { id: true },
  })

  let requeued = 0
  for (const j of stalled) {
    // Atomic CAS: only re-queue if still PROCESSING (prevents duplicates across workers)
    const result = await db.job.updateMany({
      where: { id: j.id, status: 'PROCESSING' },
      data: { status: 'QUEUED', stage: 'QUEUED', progress: 0, startedAt: null },
    })
    if (result.count > 0) requeued++
  }
  return requeued
}

// ---------------------------------------------------------------------------
// Pipeline Execution with Retry
// ---------------------------------------------------------------------------

/**
 * Execute the pipeline for a claimed job. Retries transient failures with
 * exponential backoff before permanently marking the job as FAILED.
 */
export async function executeJobWithRetry(
  claim: ClaimResult,
  logPrefix = '[job-runner]',
): Promise<void> {
  const { jobId, documentId, mode } = claim
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
      logger.warn('Retrying job', { jobId, attempt, maxRetries: MAX_RETRIES, delayMs: delay, source: logPrefix })
      await sleep(delay)

      // Update job to show retry in progress
      await db.job.update({
        where: { id: jobId },
        data: { stage: `RETRY_${attempt}`, error: null },
      }).catch(() => {})
    }

    try {
      // Race the pipeline against a timeout so hung jobs don't block concurrency.
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Pipeline timed out after ${JOB_TIMEOUT_MS / 1000}s`)),
          JOB_TIMEOUT_MS,
        )
      })

      // Dynamic import so dev-mode hot-reloads pick up code changes.
      const { runPipeline } = await import('./orchestrator')
      const result = await Promise.race([runPipeline({ jobId, documentId, mode }), timeout])

      logger.info('Job completed', {
        jobId,
        narratives: result.narrativeIds.length,
        scenes: result.sceneCount,
        durationMs: result.durationMs,
        retries: attempt,
        source: logPrefix,
      })
      return // Success — exit retry loop
    } catch (err) {
      lastError = err as Error
      const msg = lastError.message

      // Non-retryable errors: don't waste time retrying
      if (isNonRetryableError(msg)) {
        logger.error('Job failed (non-retryable)', { jobId, error: msg, source: logPrefix })
        break
      }

      logger.warn('Job attempt failed', { jobId, attempt: attempt + 1, error: msg, source: logPrefix })
    }
  }

  // All retries exhausted — mark as permanently FAILED in dead-letter state (spec 2.18)
  const errorMsg = lastError?.message || 'Unknown error'
  logger.error('Job permanently failed', { jobId, error: errorMsg, source: logPrefix })

  await db.job.update({
    where: { id: jobId },
    data: {
      status: 'DEAD_LETTER',
      stage: 'FAILED',
      error: errorMsg,
      completedAt: new Date(),
    },
  }).catch(() => {})

  eventBus.publish({
    type: 'error',
    jobId,
    stage: 'FAILED',
    message: errorMsg,
    timestamp: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Determine if an error is non-retryable (logic errors, invalid input, etc.)
 * vs transient (file locks, memory pressure, timeouts).
 */
function isNonRetryableError(msg: string): boolean {
  const nonRetryable = [
    'Unsupported file type',
    'Document not found',
    'No file path provided',
    'Invalid mode',
  ]
  return nonRetryable.some((pattern) => msg.includes(pattern))
}
