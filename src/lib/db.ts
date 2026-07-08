import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Enable WAL mode for SQLite to support concurrent readers/writers.
// This prevents SQLITE_BUSY errors when the Next.js process and worker
// access the database simultaneously.
//
// Note: these PRAGMAs return a result row (e.g. `journal_mode = wal`),
// so they must use `$queryRawUnsafe` — `$executeRawUnsafe` rejects any
// statement that returns rows on SQLite.
db.$queryRawUnsafe('PRAGMA journal_mode = WAL').catch(() => {
  // Silently ignore — WAL may already be set or DB may not be ready yet.
})
db.$queryRawUnsafe('PRAGMA busy_timeout = 5000').catch(() => {})
// Performance PRAGMAs — safe for WAL mode and dramatically reduce disk I/O:
//   • synchronous=NORMAL: only fsync at checkpoint (not every commit). Safe
//     under WAL — the OS page cache is durable enough; single-row corruption
//     is impossible because WAL writes are append-only.
//   • cache_size=-20000: 20 MB page cache (negative = KB). Default is ~2 MB.
//   • temp_store=MEMORY: temp tables/indices live in RAM, not on disk.
//   • mmap_size=268435456: 256 MB memory-mapped I/O window for faster reads
//     on large documents. No-op if the OS denies the mapping.
db.$queryRawUnsafe('PRAGMA synchronous = NORMAL').catch(() => {})
db.$queryRawUnsafe('PRAGMA cache_size = -20000').catch(() => {})
db.$queryRawUnsafe('PRAGMA temp_store = MEMORY').catch(() => {})
db.$queryRawUnsafe('PRAGMA mmap_size = 268435456').catch(() => {})
