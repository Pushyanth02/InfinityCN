/**
 * Tests for runtime detection (isVercel / usesLibSQL / runtimeUploadDir) and
 * the serverless dispatch behavior.
 *
 * The dispatch module branches on isVercel():
 *   • Vercel → registers an after() callback (mocked) that claims + runs the job
 *   • Self-hosted → no-op (the embedded poller handles it)
 *
 * We mock next/server's after(), claimSpecificJob, and executeJobWithRetry to
 * verify the wiring without hitting the DB or the real pipeline.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// --- Mocks (set up before importing the modules under test) ---

const afterMock = vi.fn((cb: () => void) => {
  // next/server's after() schedules the callback; we run it immediately so
  // tests can assert on its effects synchronously.
  cb()
})

vi.mock('next/server', () => ({
  after: afterMock,
}))

const claimSpecificJobMock = vi.fn()
const executeJobWithRetryMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/pipeline/job-runner', () => ({
  claimSpecificJob: (...args: any[]) => claimSpecificJobMock(...args),
  executeJobWithRetry: (...args: any[]) => executeJobWithRetryMock(...args),
}))

// Stash original env so each test starts clean.
const envStash: Record<string, string | undefined> = {}

describe('runtime detection', () => {
  let runtime: any

  beforeEach(async () => {
    for (const k of ['VERCEL', 'LIBSQL_URL', 'LIBSQL_AUTH_TOKEN', 'UPLOAD_DIR']) {
      envStash[k] = process.env[k]
      delete process.env[k]
    }
    // Re-import to pick up the env state (modules cache by reference; we use
    // a unique query param to bust the cache per test run).
    vi.resetModules()
    runtime = await import('@/lib/runtime')
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(envStash)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('isVercel() is true when VERCEL=1', () => {
    process.env.VERCEL = '1'
    expect(runtime.isVercel()).toBe(true)
  })

  it('isVercel() is false when VERCEL is unset', () => {
    delete process.env.VERCEL
    expect(runtime.isVercel()).toBe(false)
  })

  it('usesLibSQL() is true when LIBSQL_URL is set', () => {
    process.env.LIBSQL_URL = 'libsql://test.turso.io'
    expect(runtime.usesLibSQL()).toBe(true)
  })

  it('usesLibSQL() is false when LIBSQL_URL is unset', () => {
    delete process.env.LIBSQL_URL
    expect(runtime.usesLibSQL()).toBe(false)
  })

  it('runtimeUploadDir() returns /tmp/lemniscate-uploads on Vercel', () => {
    process.env.VERCEL = '1'
    expect(runtime.runtimeUploadDir()).toBe('/tmp/lemniscate-uploads')
  })

  it('runtimeUploadDir() honors UPLOAD_DIR off-Vercel', () => {
    delete process.env.VERCEL
    process.env.UPLOAD_DIR = '/data/uploads'
    expect(runtime.runtimeUploadDir()).toBe('/data/uploads')
  })

  it('useInRequestProcessing() tracks isVercel()', () => {
    process.env.VERCEL = '1'
    expect(runtime.useInRequestProcessing()).toBe(true)
    delete process.env.VERCEL
    expect(runtime.useInRequestProcessing()).toBe(false)
  })
})

describe('dispatchProcessing', () => {
  let dispatch: any

  beforeEach(async () => {
    afterMock.mockClear()
    claimSpecificJobMock.mockReset()
    executeJobWithRetryMock.mockReset().mockResolvedValue(undefined)
    for (const k of ['VERCEL', 'LIBSQL_URL']) {
      envStash[k] = process.env[k]
      delete process.env[k]
    }
    vi.resetModules()
    const mod = await import('@/lib/pipeline/dispatch')
    dispatch = mod.dispatchProcessing
    // Re-wire the mocks after resetModules
    const jr = await import('@/lib/pipeline/job-runner')
    ;(jr as any).claimSpecificJob = claimSpecificJobMock
    ;(jr as any).executeJobWithRetry = executeJobWithRetryMock
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(envStash)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('is a no-op on self-hosted (after() not called)', async () => {
    delete process.env.VERCEL
    await dispatch('job-123')
    expect(afterMock).not.toHaveBeenCalled()
    expect(claimSpecificJobMock).not.toHaveBeenCalled()
  })

  it('registers an after() callback on Vercel that claims + runs the job', async () => {
    process.env.VERCEL = '1'
    process.env.LIBSQL_URL = 'libsql://test.turso.io'
    claimSpecificJobMock.mockResolvedValue({
      jobId: 'job-123',
      documentId: 'doc-456',
      mode: 'BOTH',
    })

    await dispatch('job-123')

    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(claimSpecificJobMock).toHaveBeenCalledWith('job-123')
    expect(executeJobWithRetryMock).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job-123', documentId: 'doc-456', mode: 'BOTH' }),
      '[vercel-dispatch]',
    )
  })

  it('skips processing when the job is already claimed (CAS miss)', async () => {
    process.env.VERCEL = '1'
    process.env.LIBSQL_URL = 'libsql://test.turso.io'
    claimSpecificJobMock.mockResolvedValue(null) // already claimed/processed

    await dispatch('job-999')

    expect(executeJobWithRetryMock).not.toHaveBeenCalled()
  })

  it('swallows pipeline errors so they never reach the route handler', async () => {
    process.env.VERCEL = '1'
    process.env.LIBSQL_URL = 'libsql://test.turso.io'
    claimSpecificJobMock.mockResolvedValue({ jobId: 'j', documentId: 'd', mode: 'BOTH' })
    executeJobWithRetryMock.mockRejectedValue(new Error('pipeline boom'))

    // Should NOT throw — dispatch is fire-and-forget.
    await expect(dispatch('j')).resolves.toBeUndefined()
  })
})
