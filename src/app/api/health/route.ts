/**
 * GET /api/health — health check with database connectivity verification.
 * Returns 200 if both the process and database are healthy.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.$queryRawUnsafe('SELECT 1')
    return NextResponse.json({
      ok: true,
      service: 'lemniscate',
      database: 'connected',
      time: Date.now(),
    })
  } catch {
    return NextResponse.json(
      { ok: false, service: 'lemniscate', database: 'disconnected', time: Date.now() },
      { status: 503 },
    )
  }
}
