import { PrismaClient } from '@prisma/client'
import { usesLibSQL } from '@/lib/runtime'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Vercel / Turso: use the libSQL driver adapter so Prisma talks to a remote
  // libSQL database instead of a local SQLite file. @prisma/adapter-libsql
  // + @libsql/client are already dependencies (package.json).
  if (usesLibSQL()) {
    const libsql = require('@libsql/client')
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const url = process.env.LIBSQL_URL as string
    const authToken = process.env.LIBSQL_AUTH_TOKEN
    const client = libsql.createClient({ url, authToken })
    const adapter = new PrismaLibSQL(client)
    return new PrismaClient({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      adapter: adapter as any,
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
    })
  }

  // Self-hosted / local dev: local file-backed SQLite.
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Enable WAL mode for SQLite to support concurrent readers/writers.
// This prevents SQLITE_BUSY errors when the Next.js process and worker
// access the database simultaneously.
//
// Gated to the local-file path: these PRAGMAs are SQLite-only and only
// meaningful for the local file backend. Turso (libSQL) manages its own
// journaling server-side and rejects client-side PRAGMAs.
//
// Note: these PRAGMAs return a result row (e.g. journal_mode = wal),
// so they must use $queryRawUnsafe — $executeRawUnsafe rejects any
// statement that returns rows on SQLite.
if (!usesLibSQL()) {
  db.$queryRawUnsafe('PRAGMA journal_mode = WAL').catch(() => {
    // Silently ignore — WAL may already be set or DB may not be ready yet.
  })
  db.$queryRawUnsafe('PRAGMA busy_timeout = 5000').catch(() => {})
  // Performance PRAGMAs — safe for WAL mode and dramatically reduce disk I/O.
  db.$queryRawUnsafe('PRAGMA synchronous = NORMAL').catch(() => {})
  db.$queryRawUnsafe('PRAGMA cache_size = -20000').catch(() => {})
  db.$queryRawUnsafe('PRAGMA temp_store = MEMORY').catch(() => {})
  db.$queryRawUnsafe('PRAGMA mmap_size = 268435456').catch(() => {})
}
