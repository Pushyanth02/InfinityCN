import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Continue the Story — AI writes the next passage in the author's voice. */
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

  const idx = typeof chapterIndex === "number" ? chapterIndex : parsed.chapters.length - 1;
  const ch = parsed.chapters[idx];
  if (!ch) return NextResponse.json({ error: "Chapter not found" }, { status: 400 });
  const body = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 4000);

  const system = `You are a gifted ghostwriter continuing a novel in the author's own voice. Read the supplied chapter closely — absorb its style, rhythm, imagery, and tone. Then write the NEXT passage (250-400 words) that would follow naturally.

Stay faithful to:
- The narrator's voice and point of view
- The established setting, mood, and pacing
- The characters' personalities and speech patterns

Write only the continuation — no headings, no preamble, no "Here is the next passage". Just the prose itself, ready to append to the chapter. Use Markdown for any emphasis (italics) the style calls for.`;

  const user = `Title: ${doc.title}\nChapter: ${ch.title}\n\n${body}`;
  const continuation = await aiComplete(system, user);

  await logActivity({ type: "ai_continue", documentId, detail: doc.title });
  return NextResponse.json({ continuation, chapterTitle: ch.title });
}
