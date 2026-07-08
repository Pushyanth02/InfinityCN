/**
 * Lemniscate — ID Parameter Validation
 * ----------------------------------------------------------------------------
 * Validates that path parameters conform to expected formats (CUID or UUID).
 * Rejects malformed IDs containing traversal characters or injection patterns.
 *
 * Spec reference: Security fix 2.3
 */

import { NextResponse } from 'next/server'

/**
 * CUID pattern: starts with 'c', followed by 20-30 alphanumeric lowercase chars.
 * UUID pattern: 8-4-4-4-12 hex characters.
 * Also accept standard CUID2 (any length 24-32 alphanumeric).
 */
const CUID_PATTERN = /^c[a-z0-9]{20,30}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CUID2_PATTERN = /^[a-z0-9]{24,32}$/

/**
 * Returns true if the ID looks like a valid CUID, CUID2, or UUID.
 */
export function isValidId(id: string): boolean {
  if (!id || id.length === 0 || id.length > 64) return false
  // Reject obvious injection patterns
  if (/[/\\.\s]/.test(id)) return false
  return CUID_PATTERN.test(id) || UUID_PATTERN.test(id) || CUID2_PATTERN.test(id)
}

/**
 * Validate an ID parameter and return a 400 response if invalid.
 * Returns null if valid (caller should proceed).
 */
export function validateIdParam(id: string, paramName = 'id'): NextResponse | null {
  if (!isValidId(id)) {
    return NextResponse.json(
      { error: `Invalid ${paramName} format` },
      { status: 400 },
    )
  }
  return null
}
