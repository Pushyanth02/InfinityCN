/**
 * GET /api/health — health check with database connectivity verification.
 *
 * Thin wrapper over the job service's checkHealth(). Returns 200 when the
 * database is reachable, 503 when it is not. The HTTP status code (not the
 * body) is what Docker Compose / Dockerfile healthchecks rely on
 * (`wget --spider`), so the 200/503 distinction must be preserved exactly.
 *
 * Response body is a superset of the legacy shape: it keeps `ok`, `service`,
 * `database`, and a timestamp, and adds `status`, `latencyMs`, `version`.
 */
import { NextResponse } from 'next/server'
import { checkHealth } from '@/lib/services/job.service'

export async function GET() {
  const health = await checkHealth()
  const status = health.ok ? 200 : 503
  return NextResponse.json(
    {
      ok: health.ok,
      service: 'lemniscate',
      status: health.status,
      database: health.database,
      latencyMs: health.latencyMs,
      version: health.version,
      time: health.timestamp,
    },
    { status },
  )
}
