/**
 * Security tests — Trusted Proxy CIDR Configuration
 *
 * Verifies that getClientIP correctly trusts X-Forwarded-For headers
 * only from configured proxy IPs/CIDRs, preventing IP spoofing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'

describe('getClientIP — trusted proxy', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  function mockRequest(remoteAddr: string, headers: Record<string, string> = {}): Request {
    const req = new Request('http://localhost/api/test')
    // Simulate the socket remoteAddress
    ;(req as any).socket = { remoteAddress: remoteAddr }
    for (const [key, value] of Object.entries(headers)) {
      req.headers.set(key, value)
    }
    return req
  }

  it('trusts X-Forwarded-For from localhost (default)', async () => {
    delete process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const req = mockRequest('127.0.0.1', {
      'x-forwarded-for': '203.0.113.50',
    })
    expect(getClientIP(req)).toBe('203.0.113.50')
  })

  it('does NOT trust X-Forwarded-For from non-proxy IP', async () => {
    delete process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const req = mockRequest('198.51.100.22', {
      'x-forwarded-for': '203.0.113.50',
    })
    // Should return the actual remote address, not the spoofed header
    expect(getClientIP(req)).toBe('198.51.100.22')
  })

  it('trusts X-Forwarded-For from configured CIDR range', async () => {
    process.env.LEMNISCATE_TRUSTED_PROXY_CIDR = '172.16.0.0/12'
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    // Docker IPs like 172.18.0.x are in 172.16.0.0/12
    const req = mockRequest('172.18.0.2', {
      'x-forwarded-for': '203.0.113.99',
    })
    expect(getClientIP(req)).toBe('203.0.113.99')
  })

  it('does NOT trust X-Forwarded-For from IP outside CIDR range', async () => {
    process.env.LEMNISCATE_TRUSTED_PROXY_CIDR = '172.16.0.0/12'
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    // 10.0.0.x is NOT in 172.16.0.0/12
    const req = mockRequest('10.0.0.5', {
      'x-forwarded-for': '203.0.113.99',
    })
    expect(getClientIP(req)).toBe('10.0.0.5')
  })

  it('handles IPv4-mapped IPv6 loopback', async () => {
    delete process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const req = mockRequest('::ffff:127.0.0.1', {
      'x-forwarded-for': '203.0.113.77',
    })
    expect(getClientIP(req)).toBe('203.0.113.77')
  })

  it('falls back to x-real-ip when X-Forwarded-For is absent', async () => {
    delete process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const req = mockRequest('127.0.0.1', {
      'x-real-ip': '192.0.2.100',
    })
    expect(getClientIP(req)).toBe('192.0.2.100')
  })

  it('returns unknown when remoteAddr is empty and no headers', async () => {
    delete process.env.LEMNISCATE_TRUSTED_PROXY_CIDR
    const { getClientIP } = await import('@/lib/middleware/rate-limit')
    const req = mockRequest('', {})
    expect(getClientIP(req)).toBe('unknown')
  })
})
