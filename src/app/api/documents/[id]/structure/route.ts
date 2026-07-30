import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CoreEngine } from "@/lib/engine/core-engine";
import type { ParsedDoc, Chapter } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/documents/[id]/structure
 *
 * Lazily runs OCR refinement on a single chapter. This is called by the
 * reader when a chapter is opened — the chapter renders instantly with
 * raw text, then this endpoint refines the OCR in the background.
 *
 * Body:
 *   - chapterIndex: number (which chapter to refine)
 *   - regenerate?: boolean (force re-refinement, default false)
 *
 * The refined text is persisted on the chapter's `refinedText` field in the
 * document's contentJson, so subsequent opens load instantly from cache.
 *
 * If the chapter already has `refinedText` and `regenerate` is false, the
 * cached result is returned immediately without calling the AI.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { chapterIndex, regenerate } = body;

  if (typeof chapterIndex !== "number" || chapterIndex < 0) {
    return NextResponse.json(
      { error: "chapterIndex (number) required" },
      { status: 400 },
    );
  }

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status !== "ready")
    return NextResponse.json({ error: "Document not ready" }, { status: 400 });

  let parsed: ParsedDoc | null = null;
  try {
    parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
  } catch {
    // ignore
  }
  if (!parsed) return NextResponse.json({ error: "No content" }, { status: 400 });

  const chapter: Chapter | undefined = parsed.chapters[chapterIndex];
  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  // Return cached refinement if present (unless regenerating)
  if (chapter.refinedText && !regenerate) {
    return NextResponse.json({
      refined: true,
      cached: true,
      chapterIndex,
      refinedText: chapter.refinedText,
    });
  }

  // Run OCR refinement
  const engine = new CoreEngine();
  let result;
  try {
    result = await engine.refineChapterOCR(chapter);
  } catch (err: any) {
    return NextResponse.json({
      refined: false,
      cached: false,
      chapterIndex,
      error: err?.message ?? "OCR refinement failed",
    });
  }

  if (!result.refinedText) {
    return NextResponse.json({
      refined: false,
      cached: false,
      chapterIndex,
      error: "Refinement produced no output",
    });
  }

  // Persist the refined text back to the chapter's refinedText field
  chapter.refinedText = result.refinedText;
  if (result.titleRefined) {
    chapter.title = result.titleRefined;
  }
  await db.document.update({
    where: { id },
    data: {
      contentJson: JSON.stringify(parsed),
      title: result.titleRefined ?? doc.title,
    },
  });

  return NextResponse.json({
    refined: true,
    cached: false,
    chapterIndex,
    refinedText: result.refinedText,
    titleRefined: result.titleRefined,
  });
}
