/**
 * GET /api/v1/health — Liveness + database connectivity check
 *
 * Versioned API using the service layer and standard response envelope.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { checkHealth } from '@/lib/services/job.service'
import { apiSuccess } from '@/lib/api/response'

export async function GET(_req: NextRequest) {
  const health = await checkHealth()
  return apiSuccess(health, health.ok ? 200 : 503)
}