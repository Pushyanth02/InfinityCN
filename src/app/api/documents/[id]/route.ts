import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { rowFromDoc } from "@/lib/doc-serialize";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId } = ensureSession(req);
  // Enforce ownership — user can only access their own documents.
  const doc = await verifyDocumentOwnership(id, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = rowFromDoc(doc);
  let content = null;
  try {
    if (doc.contentJson) content = JSON.parse(doc.contentJson);
  } catch {
    // ignore
  }
  return NextResponse.json({ document: row, content });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId } = ensureSession(req);
  // Enforce ownership.
  const owned = await verifyDocumentOwnership(id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (typeof body.readingProgress === "number") data.readingProgress = body.readingProgress;
  if (typeof body.lastChunkIndex === "number") data.lastChunkIndex = body.lastChunkIndex;
  if (typeof body.lastReadAt !== "undefined") data.lastReadAt = body.lastReadAt ? new Date(body.lastReadAt) : null;
  if (typeof body.favorite === "boolean") data.favorite = body.favorite;
  if (Array.isArray(body.tags)) data.tags = JSON.stringify(body.tags);
  if (typeof body.collection === "string" || body.collection === null) data.collection = body.collection;
  if (typeof body.title === "string") data.title = body.title;

  const updated = await db.document.update({ where: { id }, data });
  return NextResponse.json({ document: rowFromDoc(updated) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId } = ensureSession(req);
  // Enforce ownership.
  const owned = await verifyDocumentOwnership(id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.document.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
