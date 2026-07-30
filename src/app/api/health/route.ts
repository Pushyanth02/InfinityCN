import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Lightweight health check endpoint for deployment platforms (Vercel,
 * Render, Supabase). Returns 200 with a JSON body if the server is
 * running and the database is reachable.
 */
export async function GET() {
  try {
    // Quick DB ping
    const { db } = await import("@/lib/db");
    await db.document.count();
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "degraded",
        timestamp: new Date().toISOString(),
        database: "error",
        error: err?.message ?? "Unknown database error",
      },
      { status: 503 },
    );
  }
}
