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

/** Alternate Ending — AI rewrites how the story could have ended. */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, twist } = await req.json();
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

  const excerpt = buildExcerpt(parsed, 8, 1200, 12000);
  const twistClause = typeof twist === "string" && twist.trim()
    ? `\n\nThe reader offers this twist to honor: "${twist.trim()}". Weave it in if it enriches the ending.`
    : "";

  const system = `You are an imaginative storyteller who reimagines how a story could end. Read the supplied text, then write a fresh, compelling ALTERNATE ENDING (300-500 words).

The new ending should:
- Grow naturally from the characters and conflicts already established
- Take a meaningfully different path from the implied original
- Be vivid and emotionally satisfying
- Use the author's general style and tone

Write only the new ending passage — no headings like "Alternate Ending", no preamble, no explanation. Just the prose. Use Markdown italics for emphasis where fitting.${twistClause}`;

  const user = `Title: ${doc.title}\n\n${excerpt}`;
  const ending = await aiComplete(system, user);

  await logActivity({ type: "ai_ending", documentId, detail: doc.title });
  return NextResponse.json({ ending });
}
