import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gradientForId, sourceTypeFromMime } from "@/lib/types";
import { CoreEngine } from "@/lib/engine/core-engine";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { validateUploadedFile } from "@/lib/security";

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

// GET /api/documents — list all (excludes contentJson for performance)
export async function GET() {
  const docs = await db.document.findMany({
    orderBy: { createdAt: "desc" },
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
  return NextResponse.json({ documents: docs.map(rowFromDoc) });
}

// POST /api/documents — upload + parse a new document
export async function POST(req: NextRequest) {
  try {
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
      await db.document.update({
        where: { id: created.id },
        data: { status: "error", error: err?.message ?? "Parse failed" },
      });
      await logActivity({ type: "upload", documentId: created.id, detail: `error: ${err?.message}` });
      return NextResponse.json(
        { error: err?.message ?? "Parse failed", document: rowFromDoc({ ...created, coverGradient: gradient }) },
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
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
