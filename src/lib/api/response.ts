/**
 * Lemniscate — API Response Helpers
 * ----------------------------------------------------------------------------
 * Standard response envelope and error handling for all API routes.
 *
 * Envelope format:
 *   Success: { data: T, meta?: { pagination?, totalCount?, ... } }
 *   Error:   { error: { code, message, details? } }
 */

import { NextResponse } from 'next/server'
import {
  isDomainError,
  getErrorStatusCode,
  getErrorCode,
} from '@/lib/domain/errors'
import { createLogger } from '@/lib/logger'

const logger = createLogger('api')

// ─── Success responses ────────────────────────────────────────────────────

/** Metadata included in the response envelope. */
export interface ResponseMeta {
  pagination?: PaginationMeta
  totalCount?: number
  [key: string]: unknown
}

/** Pagination metadata returned with paginated responses. */
export interface PaginationMeta {
  limit: number
  offset: number
  total?: number
  hasMore?: boolean
  cursor?: string
}

/**
 * Send a successful data response.
 *
 * @example
 *   return apiSuccess({ id: '123', title: 'Hamlet' })
 *   // → 200 { data: { id: '123', title: 'Hamlet' } }
 */
export function apiSuccess<T>(
  data: T,
  status = 200,
  meta?: ResponseMeta,
): NextResponse {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status })
}

/**
 * Send a paginated data response.
 */
export function apiPaginated<T>(
  data: T[],
  pagination: PaginationMeta,
  status = 200,
): NextResponse {
  return NextResponse.json(
    { data, meta: { pagination } },
    { status },
  )
}

/**
 * Send a 201 Created response with the new resource.
 */
export function apiCreated<T>(data: T, meta?: ResponseMeta): NextResponse {
  return apiSuccess(data, 201, meta)
}

/**
 * Send a 204 No Content response (for deletes with no body).
 */
export function apiNoContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

// ─── Error responses ──────────────────────────────────────────────────────

/** Error body shape. */
interface ErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * Convert any error (domain or unknown) into a structured API error response.
 *
 * - DomainError → uses its `statusCode` and `code`.
 * - Unknown error → 500 INTERNAL_ERROR (stack trace never leaked).
 */
export function apiError(err: unknown): NextResponse {
  const statusCode = getErrorStatusCode(err)
  const code = getErrorCode(err)

  // Log non-4xx errors (server faults) with full context.
  if (statusCode >= 500) {
    logger.error('API server error', {
      code,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }

  const body: ErrorBody = {
    error: {
      code,
      message: isDomainError(err) ? err.message : 'An unexpected error occurred.',
    },
  }

  // Include validation details for client-side correction (4xx only).
  if (isDomainError(err) && err.details) {
    body.error.details = err.details
  }

  // Add Retry-After header for rate limit errors.
  const headers: Record<string, string> = {}
  if (isDomainError(err) && 'retryAfterSec' in err && err.retryAfterSec) {
    headers['Retry-After'] = String(err.retryAfterSec)
  }

  return NextResponse.json(body, { status: statusCode, headers })
}

/**
 * Convenience: create a 400 validation error response.
 */
export function apiValidationError(message: string, details?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    { error: { code: 'VALIDATION_ERROR', message, ...(details ? { details } : {}) } },
    { status: 400 },
  )
}

/**
 * Convenience: create a 404 not found response.
 */
export function apiNotFound(resource: string, id?: string): NextResponse {
  const message = id ? `${resource} '${id}' not found` : `${resource} not found`
  return NextResponse.json(
    { error: { code: 'NOT_FOUND', message } },
    { status: 404 },
  )
}

/**
 * Send an export (`ExportResult`-shaped) as a downloadable attachment.
 *
 * Handles both text bodies (`string`) and binary bodies (`Uint8Array`/Buffer,
 * e.g. the EPUB stored-zip). Used by both the unversioned and versioned export
 * routes so they share one serialization path.
 */
export function sendExport(result: {
  mimeType: string
  filename: string
  sizeBytes: number
  body: string | Uint8Array
}): NextResponse {
  return new NextResponse(result.body as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(result.sizeBytes),
    },
  })
}