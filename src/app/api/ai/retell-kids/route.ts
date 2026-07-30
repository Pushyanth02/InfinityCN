import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Retell for Kids — retells the story as a warm, imaginative bedtime tale. */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, chapterIndex } = await req.json();
  if (!documentId || !isValidDocumentId(documentId))
    return NextResponse.json({ error: "Valid documentId required" }, { status: 400 });

  const doc = await db.document.findUnique({ where: { id: documentId } });
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

  // Chapter-scoped if requested, else whole-doc sample.
  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    scopeLabel = ch.title;
  } else {
    excerpt = buildExcerpt(parsed, 6, 900, 8000);
    scopeLabel = doc.title;
  }

  const system = `You are the warmest, most imaginative storyteller a child could wish for. Retell the supplied story as a cozy, wonder-filled tale for a young reader (around age 7-10).

Your retelling should:
- Use simple, musical sentences a child can follow
- Keep the wonder, adventure, and heart of the original
- Soften anything scary or too grown-up into something gentle
- Add tiny sparkles of magic and feeling ("the moon watched like a kind eye")
- End with a warm, comforting note

Write 200-350 words. No headings — just the story, flowing like a bedtime tale. You may use *italics* for whispered or special words.`;

  const user = `Original story — ${scopeLabel}:\n\n${excerpt}`;
  const story = await aiComplete(system, user);

  await logActivity({ type: "ai_kids", documentId, detail: doc.title });
  return NextResponse.json({ story, scope: scopeLabel });
}
