/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 specification
 *
 * Returns the full OpenAPI specification for the v1 API. Gated by the standard
 * auth + rate-limit check so unauthenticated callers cannot enumerate the
 * API surface by requesting this endpoint.
 */
import { NextResponse } from 'next/server'
import { openApiSpec } from '@/lib/api/openapi'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'

export async function GET(req: Request) {
  const blocked = await securityCheck(req, `openapi:${getClientIP(req)}`, 30)
  if (blocked) return blocked

  return NextResponse.json(openApiSpec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
