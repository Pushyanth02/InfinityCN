import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { verifyDocumentOwnership } from "@/lib/quota";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/activity — the current user's recent activity only.
export async function GET(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const events = await db.activityEvent.findMany({
    where: { userId },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: { document: { select: { title: true } } },
  });
  return NextResponse.json({
    activity: events.map((e) => ({
      id: e.id,
      documentId: e.documentId,
      type: e.type,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
      documentTitle: e.document?.title ?? null,
    })),
  }, { headers: setCookie });
}

// POST /api/activity — record an event for the current user.
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.general);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!body?.type) return NextResponse.json({ error: "type required" }, { status: 400, headers: setCookie });

  // If a documentId is supplied, it must belong to the caller — this stops
  // one user from attaching activity to another user's document.
  let documentId: string | null = null;
  if (body.documentId) {
    if (typeof body.documentId !== "string") {
      return NextResponse.json({ error: "Invalid documentId" }, { status: 400, headers: setCookie });
    }
    const owned = await verifyDocumentOwnership(body.documentId, userId);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
    documentId = body.documentId;
  }

  await logActivity({
    type: String(body.type),
    documentId,
    detail: body.detail ? String(body.detail) : null,
    userId,
  });
  return NextResponse.json({ ok: true }, { headers: setCookie });
}
