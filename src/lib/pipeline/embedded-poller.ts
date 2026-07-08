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

// Process-level resilience: prevent uncaught errors from killing the server
if (!process.env.LEMNISCATE_GUARDS_SET) {
  process.env.LEMNISCATE_GUARDS_SET = '1'
  process.on('uncaughtException', (err) => {
    console.error('[lemniscate] UNCAUGHT EXCEPTION (surviving):', (err as Error)?.message || err)
  })
  process.on('unhandledRejection', (err) => {
    console.error('[lemniscate] UNHANDLED REJECTION (surviving):', err)
  })
}

let started = false
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1200', 10)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10)
let inFlight = 0

export function startEmbeddedPoller() {
  if (started) return
  started = true
  console.log('[embedded-poller] starting…')

  // Re-hydrate stalled jobs (only those that are truly stale)
  ;(async () => {
    try {
      const count = await rehydrateStalledJobs()
      if (count > 0) {
        console.log(`[embedded-poller] re-queued ${count} stale job(s)`)
      }
    } catch (err) {
      console.error('[embedded-poller] re-hydrate error:', err)
    }
  })()

  const poll = async () => {
    if (inFlight >= CONCURRENCY) return
    try {
      const claim = await claimNextJob()
      if (!claim) return

      inFlight += 1
      console.log(`[embedded-poller] claimed job ${claim.jobId} (mode=${claim.mode}, doc=${claim.documentId})`)

      executeJobWithRetry(claim, '[embedded-poller]')
        .catch((err) => console.error(`[embedded-poller] job ${claim.jobId} crashed:`, err))
        .finally(() => { inFlight -= 1 })
    } catch (err) {
      console.error('[embedded-poller] poll error:', err)
    }
  }

  setInterval(poll, POLL_INTERVAL_MS)
  // kick off an initial poll after a short delay (let the server settle)
  setTimeout(poll, 2000)
}
