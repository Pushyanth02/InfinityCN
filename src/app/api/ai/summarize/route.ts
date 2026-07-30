import { isValidDocumentId } from "@/lib/security";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";
import { chatCompletionCompat } from "@/lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SummarizeRequest {
  documentId: string;
  scope: "chapter" | "novel";
  chapterIndex?: number;
  regenerate?: boolean;
}

/**
 * POST /api/ai/summarize
 *
 * Generates either a single-chapter summary or a full-novel summary.
 *
 * Body:
 *   - documentId: string
 *   - scope: "chapter" | "novel"
 *   - chapterIndex: number (required when scope === "chapter")
 *   - regenerate: boolean (force re-generation, default false)
 *
 * Chapter summaries are cached on the AiScene model with a "summary" mood
 * convention; novel summaries are cached on the Document.summary field.
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const quotaResp = await aiQuotaGate(userId, setCookie);
  if (quotaResp) return quotaResp;

  const body: SummarizeRequest = await req.json();
  const { documentId, scope, chapterIndex, regenerate } = body;

  if (!documentId)
    return NextResponse.json({ error: "documentId required" }, { status: 400 });
  if (scope !== "chapter" && scope !== "novel")
    return NextResponse.json({ error: "scope must be 'chapter' or 'novel'" }, { status: 400 });
  if (scope === "chapter" && (chapterIndex === undefined || chapterIndex < 0))
    return NextResponse.json({ error: "chapterIndex required for chapter scope" }, { status: 400 });

  const doc = await verifyDocumentOwnership(documentId, userId);
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

  // ── Novel-level summary ──────────────────────────────────────────────
  if (scope === "novel") {
    // Return cached summary if present and not regenerating
    if (!regenerate && doc.summary) {
      return NextResponse.json({ summary: doc.summary, scope: "novel", cached: true }, { headers: setCookie });
    }

    // Build a representative sample: first chunk of each chapter + middle
    const sample: string[] = [];
    for (const ch of parsed.chapters.slice(0, 15)) {
      sample.push(`## ${ch.title}`);
      sample.push((ch.chunks[0]?.text ?? "").slice(0, 800));
      if (ch.chunks.length > 1) {
        const mid = ch.chunks[Math.floor(ch.chunks.length / 2)]?.text ?? "";
        sample.push(mid.slice(0, 500));
      }
    }
    const excerpt = sample.join("\n\n").slice(0, 12000);

    const completion = await chatCompletionCompat({
      messages: [
        {
          role: "assistant",
          content:
            "You are a literary analyst. Write a tight, evocative summary of the complete work the user gives you. 2-3 short paragraphs. Plain prose, no headings. Capture the overarching subject, the narrative arc, and the distinctive voice. Do not say 'this document' — speak about the work directly.",
        },
        { role: "user", content: `Title: ${doc.title}\n\n${excerpt}` },
      ],
    }, { bot: "system", kind: "summary", documentId, userId });
    const summary = completion.choices[0]?.message?.content?.trim() ?? "";

    await db.document.update({ where: { id: documentId }, data: { summary } });
    await logActivity({ type: "ai_summarize", documentId, detail: `${doc.title} (novel)` });

    return NextResponse.json({ summary, scope: "novel", cached: false }, { headers: setCookie });
  }

  // ── Chapter-level summary ────────────────────────────────────────────
  const chapter = parsed.chapters[chapterIndex!];
  if (!chapter)
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  // Check for cached chapter summary (stored as an AiScene with mood "summary-chapter")
  const cacheKey = `summary-chapter-${chapterIndex}`;
  if (!regenerate) {
    const existing = await db.aiScene.findFirst({
      where: { documentId, mood: cacheKey },
    });
    if (existing) {
      return NextResponse.json({
        summary: existing.body,
        scope: "chapter",
        chapterIndex,
        chapterTitle: chapter.title,
        cached: true,
      }, { headers: setCookie });
    }
  } else {
    await db.aiScene.deleteMany({
      where: { documentId, mood: cacheKey },
    });
  }

  // Build the chapter excerpt (first 4000 chars of the chapter)
  const chapterText = chapter.chunks.map((c) => c.text).join("\n\n").slice(0, 4000);

  const completion = await chatCompletionCompat({
    messages: [
      {
        role: "assistant",
        content:
          "You are a literary analyst. Write a concise summary of this single chapter. 2-3 short paragraphs. Plain prose, no headings. Capture what happens, the key characters, and the emotional tone. Speak about the chapter directly — do not say 'this chapter'.",
      },
      {
        role: "user",
        content: `Title: ${doc.title}\nChapter: ${chapter.title}\n\n${chapterText}`,
      },
    ],
  }, { bot: "system", kind: "summary", documentId, userId });
  const summary = completion.choices[0]?.message?.content?.trim() ?? "";

  // Cache the chapter summary as an AiScene
  await db.aiScene.create({
    data: {
      documentId,
      ordinal: chapterIndex!,
      title: chapter.title,
      body: summary,
      mood: cacheKey,
      characters: JSON.stringify([]),
    },
  });

  await logActivity({
    type: "ai_summarize",
    documentId,
    detail: `${doc.title} — Ch ${chapterIndex! + 1}: ${chapter.title}`,
  });

  return NextResponse.json({
    summary,
    scope: "chapter",
    chapterIndex,
    chapterTitle: chapter.title,
    cached: false,
  }, { headers: setCookie });
}
