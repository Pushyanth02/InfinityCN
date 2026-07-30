import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Vocabulary — defines difficult or notable words from the text. */
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
    excerpt = buildExcerpt(parsed, 6, 900, 8000);
    scopeLabel = doc.title;
  }

  const system = `You are a patient vocabulary tutor. From the supplied text, pick 8-12 notable, challenging, or interesting words and phrases. For each, give a clear definition and show how it's used in the text.

Format each entry as Markdown:
### word (part of speech)
**Definition:** a clear, concise definition suited to how the word is used here.
**In the text:** a short quote or paraphrase showing the word in context (1 sentence).

Pick words that a curious student would want to know — not trivial common words, not impossibly obscure ones. Mix vocabulary, idioms, and any specialized terms. Never say "this document".`;

  const user = `Text: ${scopeLabel}\n\n${excerpt}`;
  const vocabulary = await aiComplete(system, user);

  await logActivity({ type: "ai_vocab", documentId, detail: doc.title });
  return NextResponse.json({ vocabulary, scope: scopeLabel });
}
