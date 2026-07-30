import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function rowFromDoc(d: any) {
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    sourceType: d.sourceType,
    mimeType: d.mimeType,
    byteSize: d.byteSize,
    status: d.status,
    error: d.error,
    warnings: d.warnings ? JSON.parse(d.warnings) : [],
    summary: d.summary,
    language: d.language,
    coverGradient: d.coverGradient,
    chapterCount: d.chapterCount,
    wordCount: d.wordCount,
    charCount: d.charCount,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    lastReadAt: d.lastReadAt ? d.lastReadAt.toISOString() : null,
    readingProgress: d.readingProgress,
    lastChunkIndex: d.lastChunkIndex,
    favorite: d.favorite,
    tags: JSON.parse(d.tags || "[]"),
    collection: d.collection,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await db.document.findUnique({ where: { id } });
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

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.document.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
