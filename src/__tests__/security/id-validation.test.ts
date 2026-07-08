/**
 * Security tests — ID Parameter Validation
 */
import { describe, it, expect } from 'vitest'
import { isValidId, validateIdParam } from '@/lib/middleware/validate-id'

describe('isValidId', () => {
  it('accepts valid CUID', () => {
    expect(isValidId('cm1abc2def3ghi4jkl5mno6p')).toBe(true)
    expect(isValidId('clb2h3k4m5n6p7q8r9s0t1u2v')).toBe(true)
  })

  it('accepts valid UUID', () => {
    expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('accepts valid CUID2', () => {
    expect(isValidId('abc123def456ghi789jkl012mn')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidId('')).toBe(false)
  })

  it('rejects overly long strings', () => {
    expect(isValidId('a'.repeat(65))).toBe(false)
  })

  it('rejects path traversal characters', () => {
    expect(isValidId('../etc/passwd')).toBe(false)
    expect(isValidId('..\\windows\\system32')).toBe(false)
    expect(isValidId('file/path')).toBe(false)
    expect(isValidId('id with spaces')).toBe(false)
  })

  it('rejects dot-dot patterns', () => {
    expect(isValidId('..test')).toBe(false)
    expect(isValidId('test..id')).toBe(false)
  })

  it('rejects SQL injection patterns', () => {
    expect(isValidId("1' OR '1'='1")).toBe(false)
    expect(isValidId('1; DROP TABLE users')).toBe(false)
  })
})

describe('validateIdParam', () => {
  it('returns null for valid IDs', () => {
    expect(validateIdParam('cm1abc2def3ghi4jkl5mno6p')).toBeNull()
  })

  it('returns 400 response for invalid IDs', () => {
    const result = validateIdParam('../hack', 'documentId')
    expect(result).not.toBeNull()
    expect(result!.status).toBe(400)
  })
})
