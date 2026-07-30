import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Explain Simply — restates the text in plain, easy-to-grasp language (ELI5). */
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

  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    scopeLabel = ch.title;
  } else {
    excerpt = buildExcerpt(parsed, 5, 900, 7000);
    scopeLabel = doc.title;
  }

  const system = `You are a wonderfully clear explainer. Restate the supplied text in simple, friendly language — as if explaining it to a curious 10-year-old or a friend who's never encountered this topic.

Your explanation should:
- Use short sentences and everyday words
- Unpack any jargon, metaphors, or tricky ideas with a plain analogy
- Keep the meaning and tone of the original
- Stay accurate — don't invent facts

Use Markdown with these sections:
## In a nutshell
One or two sentences capturing the essence.

## What's really going on
2-4 short paragraphs (or bullets) explaining the text simply.

## Why it matters
One sentence on why this is worth understanding.

Never say "this document" or "the text". Speak directly to the reader.`;

  const user = `Passage — ${scopeLabel}:\n\n${excerpt}`;
  const explanation = await aiComplete(system, user);

  await logActivity({ type: "ai_explain", documentId, detail: doc.title });
  return NextResponse.json({ explanation, scope: scopeLabel });
}
