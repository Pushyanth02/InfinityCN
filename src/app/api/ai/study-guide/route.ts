import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Study Guide — key points, themes, and takeaways for studying. */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

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

  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    scopeLabel = ch.title;
  } else {
    excerpt = buildExcerpt(parsed, 8, 1000, 10000);
    scopeLabel = doc.title;
  }

  const system = `You are an expert study-guide author helping a student understand and remember a text. Produce a clear, well-organized study guide.

Use these Markdown sections:
## Quick Summary
A 2-3 sentence overview.

## Key Points
A bulleted list of the 5-8 most important facts, events, or ideas.

## Important Characters / Figures
A short bulleted list of who matters and why (2-4 entries).

## Main Themes
3-5 bullet points, each naming a theme and one sentence on what the text says about it.

## Terms to Know
A bulleted list of any 3-6 key terms, names, or concepts with a one-line definition each.

## Discussion Questions
3 numbered questions that probe understanding (no answers).

Be accurate and specific, grounded in the text. Use **bold** for key terms. Never say "this document".`;

  const user = `Text: ${scopeLabel}\n\n${excerpt}`;
  const guide = await aiComplete(system, user);

  await logActivity({ type: "ai_study", documentId, detail: doc.title });
  return NextResponse.json({ guide, scope: scopeLabel });
}
