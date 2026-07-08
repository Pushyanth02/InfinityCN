/**
 * Lemniscate — Embedded Job Poller
 * ----------------------------------------------------------------------------
 * Runs inside the Next.js process (started lazily from /api/stats). Polls the
 * DB for QUEUED jobs and runs the deterministic pipeline.
 *
 * Uses the shared job-runner module for CAS-claim logic and pipeline execution
 * with retry support, eliminating duplication with the standalone worker.
 *
 * Reliability features:
 *   - Heartbeat-based re-hydration: only re-queue PROCESSING jobs whose
 *     startedAt is older than 5 minutes (avoids racing live workers).
 *   - Per-job timeout (5 min): hung jobs are failed and released.
 *   - Exponential backoff retry for transient failures.
 *   - Error events published to EventBus for realtime UI feedback.
 *   - Process-level guards: uncaught errors never kill the server.
 */

import { claimNextJob, executeJobWithRetry, rehydrateStalledJobs } from './job-runner'
import { createLogger } from '../logger'

const logger = createLogger('embedded-poller')

// Process-level resilience: prevent uncaught errors from killing the server
if (!process.env.LEMNISCATE_GUARDS_SET) {
  process.env.LEMNISCATE_GUARDS_SET = '1'
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION (surviving)', { error: (err as Error)?.message || String(err) })
  })
  process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION (surviving)', { error: String(err) })
  })
}

let started = false
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1200', 10)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10)
let inFlight = 0

export function startEmbeddedPoller() {
  if (started) return
  started = true
  logger.info('starting embedded poller')

  // Re-hydrate stalled jobs (only those that are truly stale)
  ;(async () => {
    try {
      const count = await rehydrateStalledJobs()
      if (count > 0) {
        logger.info('re-queued stale jobs', { count })
      }
    } catch (err) {
      logger.error('re-hydrate error', { error: (err as Error).message })
    }
  })()

  const poll = async () => {
    if (inFlight >= CONCURRENCY) return
    try {
      const claim = await claimNextJob()
      if (!claim) return

      inFlight += 1
      logger.info('claimed job', { jobId: claim.jobId, mode: claim.mode, documentId: claim.documentId })

      executeJobWithRetry(claim, '[embedded-poller]')
        .catch((err) => logger.error('job crashed', { jobId: claim.jobId, error: (err as Error).message }))
        .finally(() => { inFlight -= 1 })
    } catch (err) {
      logger.error('poll error', { error: (err as Error).message })
    }
  }

  setInterval(poll, POLL_INTERVAL_MS)
  // kick off an initial poll after a short delay (let the server settle)
  setTimeout(poll, 2000)
}
