/**
 * Lemniscate — Pipeline Dispatch
 * ----------------------------------------------------------------------------
 * Bridges the gap between "job created" and "job processed" across runtimes.
 *
 *   • Vercel (serverless): there is no long-lived process to run a `setInterval`
 *     poller. Jobs are processed in-request via Next.js `after()`, which runs
 *     after the response is sent but within the function's `maxDuration`.
 *     This keeps the upload/sample API response fast while still completing
 *     the pipeline synchronously in the same invocation (the only execution
 *     context available on serverless).
 *
 *   • Self-hosted (Docker / local dev): the embedded poller
 *     (`src/lib/pipeline/embedded-poller.ts`) or the standalone worker
 *     (`mini-services/lemniscate-worker`) picks up QUEUED jobs via the CAS
 *     `claimNextJob()` loop. In-request dispatch is a no-op here to avoid
 *     double-processing — the poller handles it.
 *
 * The dispatch is fire-and-forget: it claims the job (CAS), then runs the
 * pipeline with retry. Errors are logged and the job is marked FAILED — they
 * never propagate to the route handler (the response is already sent).
 */

import { isVercel } from '@/lib/runtime'
import { claimSpecificJob, executeJobWithRetry } from './job-runner'
import { createLogger } from '../logger'

const logger = createLogger('dispatch')

/**
 * Dispatch processing for a freshly-created job.
 *
 * On serverless runtimes this schedules the pipeline via Next.js `after()`
 * (non-blocking — the response is flushed first, then `after()` runs the
 * pipeline within the function's `maxDuration`). On self-hosted runtimes this
 * is a no-op: the embedded poller or standalone worker picks up the job.
 *
 * Safe to call from any route handler after creating a QUEUED job.
 */
export async function dispatchProcessing(jobId: string): Promise<void> {
  if (!isVercel()) {
    // Self-hosted: the background poller will claim and run this job via
    // claimNextJob(). No in-request work — avoids racing the poller.
    return
  }

  // Vercel: process in-request. Use Next.js `after()` so the HTTP response
  // is sent immediately (fast UX) and the pipeline runs within the same
  // serverless invocation's lifetime (after the response is flushed).
  //
  // `after()` is a stable Next.js API (next@14.1+) that registers a callback
  // to run after the response is sent but before the function freezes.
  // This is the serverless-native equivalent of a background worker.
  try {
    const { after } = await import('next/server')
    after(() => runJobInRequest(jobId))
  } catch {
    // `after()` is unavailable (older Next.js or Edge runtime) — fall back to
    // a fire-and-forget promise. The function stays alive until the promise
    // settles (within maxDuration) or the platform freezes it.
    void runJobInRequest(jobId)
  }
}

/**
 * Claim a specific job by ID (CAS) and run the pipeline with retry.
 *
 * Uses `claimSpecificJob` (not `claimNextJob`) so we only process the exact
 * job the route handler just created — this avoids the dispatch racing the
 * poller for an arbitrary QUEUED job. If the CAS fails (another worker
 * already claimed it), we yield gracefully.
 */
async function runJobInRequest(jobId: string): Promise<void> {
  try {
    const claim = await claimSpecificJob(jobId)
    if (!claim) {
      // Already claimed/processed by another worker (or already COMPLETED).
      logger.info('job already claimed or not in QUEUED state — skipping', { jobId })
      return
    }

    logger.info('processing job in-request', { jobId, mode: claim.mode })
    await executeJobWithRetry(claim, '[vercel-dispatch]')
  } catch (err) {
    logger.error('in-request pipeline failed', {
      jobId,
      error: (err as Error)?.message || String(err),
    })
  }
}
