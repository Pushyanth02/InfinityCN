/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Dynamic import or setup mock before importing rateLimit
vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      eval = vi.fn().mockImplementation((_script, _numKeys, key, limit, _window) => {
        // Mock Lua script behavior for testing Redis path
        if (key === 'redis-key-fail') {
          throw new Error('Redis command failed')
        }
        if (key === 'redis-key-limit') {
          return [0, 0, 45000] // allowed = 0, remaining = 0, pttl = 45000
        }
        return [1, Number(limit) - 1, 60000] // allowed = 1, remaining = limit-1, pttl = 60000
      })
      on = vi.fn()
    },
  }
})

describe('rateLimit - memory mode', () => {
  let rateLimit: any

  beforeEach(async () => {
    vi.useFakeTimers()
    const mod = await import('@/lib/middleware/rate-limit')
    rateLimit = mod.rateLimit
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('allows requests within the limit', async () => {
    const result = await rateLimit('test-key-1', 5)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('returns remaining count decreasing with each call', async () => {
    const key = 'test-key-2'
    expect((await rateLimit(key, 3)).remaining).toBe(2)
    expect((await rateLimit(key, 3)).remaining).toBe(1)
    expect((await rateLimit(key, 3)).remaining).toBe(0)
  })

  it('rejects requests after exceeding the limit', async () => {
    const key = 'test-key-3'
    for (let i = 0; i < 3; i++) await rateLimit(key, 3)
    const result = await rateLimit(key, 3)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('refills tokens after the interval', async () => {
    const key = 'test-key-4'
    for (let i = 0; i < 3; i++) await rateLimit(key, 3)
    expect((await rateLimit(key, 3)).allowed).toBe(false)

    vi.advanceTimersByTime(60_001)

    const result = await rateLimit(key, 3)
    expect(result.allowed).toBe(true)
  })

  it('provides resetMs for Retry-After header', async () => {
    const key = 'test-key-5'
    const result = await rateLimit(key, 1)
    expect(result.allowed).toBe(true)
    expect(result.resetMs).toBeGreaterThan(0)
    expect(result.resetMs).toBeLessThanOrEqual(60_000)
  })

  it('uses independent buckets for different keys', async () => {
    for (let i = 0; i < 3; i++) await rateLimit('key-a', 3)
    expect((await rateLimit('key-a', 3)).allowed).toBe(false)
    expect((await rateLimit('key-b', 3)).allowed).toBe(true)
  })
})

describe('rateLimit - Redis mode', () => {
  const originalEnv = { ...process.env }
  let rateLimit: any

  beforeEach(async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    const mod = await import('@/lib/middleware/rate-limit')
    rateLimit = mod.rateLimit
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('uses Redis script when REDIS_URL is configured', async () => {
    const result = await rateLimit('redis-key-ok', 10)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
    expect(result.resetMs).toBe(60000)
  })

  it('handles rate-limited response from Redis script', async () => {
    const result = await rateLimit('redis-key-limit', 10)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetMs).toBe(45000)
  })

  it('falls back to memory rate limiting if Redis execution fails', async () => {
    const result = await rateLimit('redis-key-fail', 5)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })
})
