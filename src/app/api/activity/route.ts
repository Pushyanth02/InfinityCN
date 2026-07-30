import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 30));
  const events = await db.activityEvent.findMany({
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
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.type) return NextResponse.json({ error: "type required" }, { status: 400 });
  const created = await db.activityEvent.create({
    data: {
      type: String(body.type),
      documentId: body.documentId ?? null,
      detail: body.detail ?? null,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
