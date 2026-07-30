import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CoreEngine } from "@/lib/engine/core-engine";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
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
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const body = await req.json();
  const { chapterIndex, regenerate } = body;

  if (typeof chapterIndex !== "number" || chapterIndex < 0) {
    return NextResponse.json(
      { error: "chapterIndex (number) required" },
      { status: 400, headers: setCookie },
    );
  }

  // Enforce ownership — a user can only refine their own documents.
  const doc = await verifyDocumentOwnership(id, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
  if (doc.status !== "ready")
    return NextResponse.json({ error: "Document not ready" }, { status: 400, headers: setCookie });

  // Per-user quota — refinement calls the AI provider.
  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit}). Try again later.` },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
    );
  }

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
    }, { headers: setCookie });
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
    }, { headers: setCookie });
  }

  if (!result.refinedText) {
    return NextResponse.json({
      refined: false,
      cached: false,
      chapterIndex,
      error: "Refinement produced no output",
    }, { headers: setCookie });
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
  }, { headers: setCookie });
}
