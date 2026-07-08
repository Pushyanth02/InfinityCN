/**
 * Lemniscate — Realtime Worker Service (port 3003)
 * ----------------------------------------------------------------------------
 * A single self-hosted mini-service that:
 *   1. Hosts a Socket.IO server for real-time job progress.
 *   2. Polls the Prisma/SQLite database for QUEUED jobs.
 *   3. Runs the deterministic pipeline (extract → original → cinematified)
 *      with exponential backoff retry for transient failures.
 *   4. Publishes ProgressEvents via the in-process EventBus, which Socket.IO
 *      forwards to subscribed clients.
 *
 * Uses the shared job-runner module for CAS-claim and pipeline execution,
 * eliminating duplication with the embedded poller.
 *
 * Production upgrade path (reserved — NOT implemented today):
 *   - A Redis-backed queue could replace the SQLite `Job` table poll for
 *     multi-worker coordination (REDIS_URL is reserved for this).
 *   - EventBus.publish() could additionally redis.publish() to a
 *     'lemniscate:events' channel so multiple worker processes fan out.
 *
 * Privacy: all processing is local. No outbound network calls. No AI.
 */

import { createServer } from 'node:http'
import { Server as IOServer } from 'socket.io'
import { eventBus } from '@/lib/events/bus'
import { claimNextJob, executeJobWithRetry, rehydrateStalledJobs } from '@/lib/pipeline/job-runner'
import type { ProgressEvent } from '@/lib/types'

const PORT = parseInt(process.env.WORKER_PORT || '3003', 10)
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '800', 10)
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '2', 10)
const GRACEFUL_SHUTDOWN_MS = parseInt(process.env.WORKER_SHUTDOWN_GRACE_MS || '30000', 10)
const WORKER_MAX_MEMORY_MB = parseInt(process.env.WORKER_MAX_MEMORY_MB || '1024', 10)

// ─── State tracking for health checks (spec 2.16) ──────────────────────────
let lastPollTime = Date.now()
let shuttingDown = false

// ---------------------------------------------------------------------------
// Process-level resilience: never die on an unhandled error
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[worker] UNCAUGHT EXCEPTION (surviving):', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[worker] UNHANDLED REJECTION (surviving):', err)
})
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, starting graceful shutdown')
  shuttingDown = true

  // Stop accepting new jobs, wait for in-flight to complete
  const deadline = Date.now() + GRACEFUL_SHUTDOWN_MS
  while (inFlight > 0 && Date.now() < deadline) {
    console.log(`[worker] waiting for ${inFlight} in-flight job(s) to complete...`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  if (inFlight > 0) {
    console.warn(`[worker] shutdown grace period expired with ${inFlight} jobs still running`)
  } else {
    console.log('[worker] all jobs completed, exiting cleanly')
  }

  io.close()
  httpServer.close()
  process.exit(0)
})

// ---------------------------------------------------------------------------
// HTTP health endpoint
// ---------------------------------------------------------------------------
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    const now = Date.now()
    const pollStale = (now - lastPollTime) > POLL_INTERVAL_MS * 3
    const allSlotsBusy = inFlight >= CONCURRENCY
    const memUsage = process.memoryUsage()
    const memUsedMB = Math.round(memUsage.rss / (1024 * 1024))
    const memPressure = memUsedMB > WORKER_MAX_MEMORY_MB * 0.8

    let status: 'healthy' | 'degraded' = 'healthy'
    const issues: string[] = []

    if (pollStale) {
      status = 'degraded'
      issues.push(`poll loop stale (last: ${now - lastPollTime}ms ago)`)
    }
    if (allSlotsBusy) {
      issues.push(`all concurrency slots occupied (${inFlight}/${CONCURRENCY})`)
    }
    if (memPressure) {
      status = 'degraded'
      issues.push(`memory pressure (${memUsedMB}MB / ${WORKER_MAX_MEMORY_MB}MB limit)`)
    }
    if (shuttingDown) {
      status = 'degraded'
      issues.push('shutting down')
    }

    const statusCode = status === 'healthy' ? 200 : 503
    res.writeHead(statusCode, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      ok: status === 'healthy',
      status,
      service: 'lemniscate-worker',
      port: PORT,
      time: now,
      inFlight,
      concurrency: CONCURRENCY,
      memoryMB: memUsedMB,
      issues: issues.length > 0 ? issues : undefined,
    }))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

// ---------------------------------------------------------------------------
// Socket.IO server (spec 2.2: CORS allowlist from environment)
// ---------------------------------------------------------------------------
const allowedOrigins = process.env.LEMNISCATE_ALLOWED_ORIGINS
  ? process.env.LEMNISCATE_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : undefined // undefined = allow all in development

const io = new IOServer(httpServer, {
  cors: {
    origin: allowedOrigins || (process.env.NODE_ENV === 'production' ? false : '*'),
    methods: ['GET', 'POST'],
  },
  path: '/',
})

io.on('connection', (socket) => {
  const jobId = socket.handshake.query.jobId as string | undefined
  console.log(`[ws] client connected (jobId=${jobId ?? '—'})`)

  try {
    if (jobId) {
      socket.join(`job:${jobId}`)
      const history = eventBus.historyFor(jobId)
      for (const evt of history) socket.emit('progress', evt)
    }
    socket.join('global')
  } catch (err) {
    console.error('[ws] connection setup error:', err)
  }

  socket.on('subscribe', (jid: string) => {
    try {
      socket.join(`job:${jid}`)
      const history = eventBus.historyFor(jid)
      for (const evt of history) socket.emit('progress', evt)
    } catch (err) {
      console.error('[ws] subscribe error:', err)
    }
  })

  socket.on('unsubscribe', (jid: string) => {
    try { socket.leave(`job:${jid}`) } catch { /* ignore */ }
  })

  socket.on('error', (err: Error) => {
    console.error('[ws] socket error:', err.message)
  })

  socket.on('disconnect', () => {
    // quiet
  })
})

io.engine.on('connection_error', (err: { message?: string }) => {
  console.error('[ws] engine connection_error:', err?.message || err)
})

// Bridge EventBus → Socket.IO
eventBus.subscribeAll((evt: ProgressEvent) => {
  try {
    io.to(`job:${evt.jobId}`).emit('progress', evt)
    io.to('global').emit('progress', evt)
  } catch (err) {
    console.error('[ws] emit error:', err)
  }
})

// ---------------------------------------------------------------------------
// Job poller (using shared job-runner module)
// ---------------------------------------------------------------------------
let inFlight = 0

async function pollOnce() {
  lastPollTime = Date.now()
  if (shuttingDown) return
  if (inFlight >= CONCURRENCY) return

  // Memory pressure check (spec 2.12)
  const memUsedMB = process.memoryUsage().rss / (1024 * 1024)
  if (memUsedMB > WORKER_MAX_MEMORY_MB * 0.8) {
    console.warn(`[worker] memory pressure: ${Math.round(memUsedMB)}MB / ${WORKER_MAX_MEMORY_MB}MB — skipping new jobs`)
    return
  }

  try {
    const claim = await claimNextJob()
    if (!claim) return

    inFlight += 1
    console.log(`[worker] claimed job ${claim.jobId} (mode=${claim.mode}, doc=${claim.documentId})`)

    executeJobWithRetry(claim, '[worker]')
      .catch((err) => console.error(`[worker] job ${claim.jobId} crashed:`, err))
      .finally(() => { inFlight -= 1 })
  } catch (err) {
    console.error('[worker] poll error:', err)
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`\n  Lemniscate Realtime Worker → http://0.0.0.0:${PORT}`)
  console.log(`  Socket.IO path: /?XTransformPort=${PORT}`)
  console.log(`  Polling for jobs every ${POLL_INTERVAL_MS}ms (concurrency=${CONCURRENCY})\n`)
})

setInterval(pollOnce, POLL_INTERVAL_MS)
pollOnce()

// ---------------------------------------------------------------------------
// Re-hydrate stalled jobs on boot
// ---------------------------------------------------------------------------
;(async () => {
  const count = await rehydrateStalledJobs()
  if (count > 0) {
    console.log(`[worker] re-queued ${count} stalled job(s)`)
  }
})()
