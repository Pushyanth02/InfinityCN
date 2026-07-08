/**
 * Security tests — Authentication & CSRF middleware
 *
 * eslint-disable @typescript-eslint/no-explicit-any
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'

// We test the individual exported functions by dynamically importing the module
// after setting env vars. This mirrors how the module initializes at startup.

describe('checkAuth', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('allows all requests when LEMNISCATE_API_KEY is not set', async () => {
    delete process.env.LEMNISCATE_API_KEY
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test')
    expect(checkAuth(req)).toBe(true)
  })

  it('rejects requests without API key when LEMNISCATE_API_KEY is set', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete process.env.LEMNISCATE_ALLOWED_ORIGINS
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test')
    expect(checkAuth(req)).toBe(false)
  })

  it('accepts Bearer token authentication', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer test-key-1234567890' },
    })
    expect(checkAuth(req)).toBe(true)
  })

  it('accepts x-api-key header authentication', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      headers: { 'x-api-key': 'test-key-1234567890' },
    })
    expect(checkAuth(req)).toBe(true)
  })

  it('rejects incorrect API key', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete process.env.LEMNISCATE_ALLOWED_ORIGINS
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      headers: { 'x-api-key': 'wrong-key' },
    })
    expect(checkAuth(req)).toBe(false)
  })

  it('rejects Bearer token with wrong key (timing-safe)', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete process.env.LEMNISCATE_ALLOWED_ORIGINS
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    // Same-length key to ensure timing-safe comparison rejects content mismatch
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer test-key-0987654321' },
    })
    expect(checkAuth(req)).toBe(false)
  })

  it('rejects when Bearer prefix is missing but key matches', async () => {
    process.env.LEMNISCATE_API_KEY = 'test-key-1234567890'
    delete process.env.LEMNISCATE_ALLOWED_ORIGINS
    delete (process.env as any).NODE_ENV
    const { checkAuth } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'test-key-1234567890' },
    })
    expect(checkAuth(req)).toBe(false)
  })
})

describe('checkCSRF', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('allows all methods when no ALLOWED_ORIGINS configured', async () => {
    delete process.env.LEMNISCATE_ALLOWED_ORIGINS
    delete process.env.LEMNISCATE_API_KEY
    delete (process.env as any).NODE_ENV
    const { checkCSRF } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', { method: 'POST' })
    expect(checkCSRF(req)).toBe(true)
  })

  it('allows GET/HEAD/OPTIONS regardless of origin', async () => {
    process.env.LEMNISCATE_ALLOWED_ORIGINS = 'http://localhost:3000'
    delete process.env.LEMNISCATE_API_KEY
    delete (process.env as any).NODE_ENV
    const { checkCSRF } = await import('@/lib/middleware/security')
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = new Request('http://localhost/api/test', { method })
      expect(checkCSRF(req)).toBe(true)
    }
  })

  it('blocks POST from unknown origin when allowlist is set', async () => {
    process.env.LEMNISCATE_ALLOWED_ORIGINS = 'http://localhost:3000'
    delete process.env.LEMNISCATE_API_KEY
    delete (process.env as any).NODE_ENV
    const { checkCSRF } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { Origin: 'http://evil.com' },
    })
    expect(checkCSRF(req)).toBe(false)
  })

  it('allows POST from allowed origin', async () => {
    process.env.LEMNISCATE_ALLOWED_ORIGINS = 'http://localhost:3000'
    delete process.env.LEMNISCATE_API_KEY
    delete (process.env as any).NODE_ENV
    const { checkCSRF } = await import('@/lib/middleware/security')
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(checkCSRF(req)).toBe(true)
  })
})
