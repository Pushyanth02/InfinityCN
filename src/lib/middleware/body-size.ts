/**
 * Lemniscate — Request Body Size Enforcement
 * ----------------------------------------------------------------------------
 * Validates that incoming request bodies don't exceed a configured maximum.
 * Applied to non-upload routes (bookmarks, progress, etc.)
 *
 * Spec reference: Security fix 2.5
 */

import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024 // 1MB

/**
 * Check Content-Length header against the maximum allowed size.
 * Returns a 413 response if exceeded, null otherwise.
 */
export function enforceBodySize(
  req: NextRequest,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): NextResponse | null {
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength > maxBytes) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 },
    )
  }
  return null
}
