import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gradientForId, sourceTypeFromMime } from "@/lib/types";
import { CoreEngine } from "@/lib/engine/core-engine";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUploadedFile } from "@/lib/security";
import { safeErrorMessage } from "@/lib/safe-error";
import { ensureSession } from "@/lib/auth";

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

// GET /api/documents — list the current user's documents (excludes contentJson)
// Supports cursor pagination: ?cursor=<id>&limit=50
export async function GET(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const cursor = url.searchParams.get("cursor") || undefined;

  const docs = await db.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // take one extra to determine if there's a next page
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: {
      id: true,
      title: true,
      author: true,
      sourceType: true,
      mimeType: true,
      byteSize: true,
      status: true,
      error: true,
      warnings: true,
      summary: true,
      language: true,
      coverGradient: true,
      chapterCount: true,
      wordCount: true,
      charCount: true,
      createdAt: true,
      updatedAt: true,
      lastReadAt: true,
      readingProgress: true,
      lastChunkIndex: true,
      favorite: true,
      tags: true,
      collection: true,
      // contentJson deliberately excluded — it can be megabytes per doc
    },
  });

  const hasMore = docs.length > limit;
  const items = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json(
    { documents: items.map(rowFromDoc), nextCursor, hasMore },
    { headers: setCookie },
  );
}

// POST /api/documents — upload + parse a new document
export async function POST(req: NextRequest) {
  try {
    const { userId, setCookie } = ensureSession(req);
    // Rate limit: 5 uploads per minute per IP
    const rl = checkRateLimit(req, RATE_LIMITS.upload);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Please try again." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file safety
    const validation = validateUploadedFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const sourceType = sourceTypeFromMime(file.type, file.name);
    const titleGuess = file.name.replace(/\.[^.]+$/, "");

    const created = await db.document.create({
      data: {
        userId,
        title: titleGuess,
        sourceType,
        mimeType: file.type || null,
        byteSize: buf.length,
        status: "processing",
        coverGradient: null,
      },
    });
    const gradient = gradientForId(created.id);
    await db.document.update({
      where: { id: created.id },
      data: { coverGradient: gradient },
    });

    // Run the full Lemniscate Core Engine pipeline:
    //   upload → ingest → scan → organize → manage → score
    const engine = new CoreEngine();
    let result;
    try {
      result = await engine.ingest(buf, file.name, file.type);
    } catch (err: any) {
      const msg = safeErrorMessage(err, "Parse failed");
      await db.document.update({
        where: { id: created.id },
        data: { status: "error", error: msg },
      });
      await logActivity({ type: "upload", documentId: created.id, detail: `error: ${msg}` });
      return NextResponse.json(
        { error: msg, document: rowFromDoc({ ...created, coverGradient: gradient }) },
        { status: 200 },
      );
    }

    const { parsed, warnings, quality } = result;
    const warningsJson = warnings.length > 0 ? JSON.stringify(warnings) : null;

    const updated = await db.document.update({
      where: { id: created.id },
      data: {
        title: parsed.title || titleGuess,
        author: parsed.author || null,
        status: "ready",
        error: null,
        warnings: warningsJson,
        language: parsed.language || null,
        chapterCount: parsed.chapters.length,
        wordCount: parsed.wordCount,
        charCount: parsed.charCount,
        contentJson: JSON.stringify(parsed),
      },
    });

    const detail = warnings.length > 0
      ? `${file.name} (quality ${quality.toFixed(2)}, ${warnings.length} warning(s))`
      : `${file.name} (quality ${quality.toFixed(2)})`;
    await logActivity({ type: "upload", documentId: created.id, detail });

    return NextResponse.json({
      document: rowFromDoc(updated),
      quality,
      warnings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: safeErrorMessage(err, "Server error") }, { status: 500 });
  }
}
