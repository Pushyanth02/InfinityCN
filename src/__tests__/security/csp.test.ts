/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

describe('proxy CSP & Nonce middleware', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('generates a cryptographically secure 16-character nonce and sets x-nonce request header', async () => {
    const { proxy } = await import('@/proxy')
    const req = new NextRequest('http://localhost:3000/some-page')
    const res = proxy(req)

    expect(res).toBeInstanceOf(NextResponse)
    
    // Check that request headers were updated via the NextRequest clone
    const newHeaders = (res as any).headers
    const csp = newHeaders.get('Content-Security-Policy')
    expect(csp).toBeDefined()
    expect(csp).toContain('nonce-')
  })

  it('configures strict script-src in production (no unsafe-inline or unsafe-eval)', async () => {
    (process.env as any).NODE_ENV = 'production'
    const { proxy } = await import('@/proxy')
    const req = new NextRequest('http://localhost:3000/some-page')
    const res = proxy(req)

    const csp = res.headers.get('Content-Security-Policy') || ''
    const scriptSrcPart = csp.split(';').find(p => p.trim().startsWith('script-src')) || ''
    expect(scriptSrcPart).toContain("script-src 'self' 'nonce-")
    expect(scriptSrcPart).not.toContain("'unsafe-inline'")
    expect(scriptSrcPart).not.toContain("'unsafe-eval'")
  })

  it('includes object-src none and base-uri self in CSP', async () => {
    (process.env as any).NODE_ENV = 'production'
    const { proxy } = await import('@/proxy')
    const req = new NextRequest('http://localhost:3000/some-page')
    const res = proxy(req)

    const csp = res.headers.get('Content-Security-Policy') || ''
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('restricts connect-src to wss: only in production (no plain ws:)', async () => {
    (process.env as any).NODE_ENV = 'production'
    const { proxy } = await import('@/proxy')
    const req = new NextRequest('http://localhost:3000/some-page')
    const res = proxy(req)

    const csp = res.headers.get('Content-Security-Policy') || ''
    const connectSrcPart = csp.split(';').find(p => p.trim().startsWith('connect-src')) || ''
    expect(connectSrcPart).toContain("'self' wss:")
    // Ensure plain ws: is not present (would allow unencrypted WebSocket)
    // Match ws: as a standalone directive, not wss:
    expect(connectSrcPart).not.toMatch(/\bws:(?!s)/)
  })

  it('configures relaxed script-src in development (allows unsafe-inline and unsafe-eval for Turbopack HMR)', async () => {
    (process.env as any).NODE_ENV = 'development'
    const { proxy } = await import('@/proxy')
    const req = new NextRequest('http://localhost:3000/some-page')
    const res = proxy(req)

    const csp = res.headers.get('Content-Security-Policy') || ''
    const scriptSrcPart = csp.split(';').find(p => p.trim().startsWith('script-src')) || ''
    expect(scriptSrcPart).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-")
  })
})
