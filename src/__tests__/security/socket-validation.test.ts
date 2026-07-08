/**
 * Security tests — Socket.IO jobId Validation
 *
 * Verifies that the worker's Socket.IO server rejects connections
 * and subscriptions with invalid jobId values, preventing room-name
 * injection attacks.
 */
import { describe, it, expect } from 'vitest'
import { isValidId } from '@/lib/middleware/validate-id'

describe('Socket.IO jobId validation', () => {
  // The worker uses isValidId to validate jobId on connection and subscribe.
  // We test the validator directly since it's the gatekeeper function.

  it('accepts valid CUID-format job IDs', () => {
    expect(isValidId('clxyz1234567890123456')).toBe(true)
    expect(isValidId('cmockid01234567890abcdef')).toBe(true)
  })

  it('accepts valid UUID-format job IDs', () => {
    expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('rejects path traversal attempts', () => {
    expect(isValidId('../../etc/passwd')).toBe(false)
    expect(isValidId('../jobs/secret')).toBe(false)
    expect(isValidId('..%2F..%2Fetc')).toBe(false)
  })

  it('rejects room-name injection attempts', () => {
    // These could be used to join arbitrary rooms if not validated
    expect(isValidId('global')).toBe(false)
    expect(isValidId('job:*')).toBe(false)
    expect(isValidId('admin')).toBe(false)
  })

  it('rejects empty and whitespace IDs', () => {
    expect(isValidId('')).toBe(false)
    expect(isValidId('   ')).toBe(false)
  })

  it('rejects excessively long IDs', () => {
    expect(isValidId('c' + 'a'.repeat(100))).toBe(false)
  })

  it('rejects IDs with special characters', () => {
    expect(isValidId('job:12345')).toBe(false)
    expect(isValidId('id-with-dashes-1234567890123')).toBe(false)
    expect(isValidId('id.with.dots')).toBe(false)
  })
})
