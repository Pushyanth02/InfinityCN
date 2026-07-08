/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 specification
 *
 * Returns the full OpenAPI specification for the v1 API.
 */
import { NextResponse } from 'next/server'
import { openApiSpec } from '@/lib/api/openapi'

export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
