import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gradientForId } from "@/lib/types";
import { CoreEngine } from "@/lib/engine/core-engine";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { safeErrorMessage } from "@/lib/safe-error";
import { createStorySchema, validate } from "@/lib/api-schemas";
import { ensureSession } from "@/lib/auth";
import { rowFromDoc } from "@/lib/doc-serialize";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/stories — create a new document from raw text authored in the
 * Create view. Runs the text through the CoreEngine so it's parsed into
 * chapters and fully readable, just like an uploaded file.
 *
 * Body: { title: string, content: string, author?: string }
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);
  const rl = checkRateLimit(req, RATE_LIMITS.upload);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json();
  const v = validate(createStorySchema, body);
  if (!v.success)
    return NextResponse.json({ error: v.error }, { status: 400 });
  const { title, content, author } = v.data;

  // Normalize the story into a Markdown buffer the engine can parse.
  const md = `# ${title.trim()}\n\n${content.trim()}\n`;
  const buf = Buffer.from(md, "utf-8");

  const created = await db.document.create({
    data: {
      userId,
      title: title.trim(),
      author: author?.trim() || "You",
      sourceType: "md",
      mimeType: "text/markdown",
      byteSize: buf.length,
      status: "processing",
      coverGradient: null,
      tags: JSON.stringify(["story"]),
    },
  });
  const gradient = gradientForId(created.id);
  await db.document.update({ where: { id: created.id }, data: { coverGradient: gradient } });

  const engine = new CoreEngine();
  let result;
  try {
    result = await engine.ingest(buf, `${title.trim()}.md`, "text/markdown");
  } catch (err: any) {
    const msg = safeErrorMessage(err, "Parse failed");
    await db.document.update({
      where: { id: created.id },
      data: { status: "error", error: msg },
    });
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
      title: parsed.title || title.trim(),
      author: author?.trim() || "You",
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

  await logActivity({ type: "upload", documentId: created.id, detail: `Created story: ${title.trim()}` });

  return NextResponse.json({
    document: rowFromDoc(updated),
    quality,
    warnings,
  });
}
