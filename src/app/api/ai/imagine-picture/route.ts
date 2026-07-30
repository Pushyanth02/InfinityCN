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

/** Imagine the Picture — generates vivid, paintable scene descriptions for kids. */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId } = await req.json();
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

  const excerpt = buildExcerpt(parsed, 6, 800, 7000);

  const system = `You are a gentle art director for a children's storybook. From the supplied story, pick 5 vivid moments that a child could illustrate with crayons, paints, or pencils.

For each moment, write a Markdown section:
## [A short picture title]
**The moment:** one sentence describing what's happening in the story.
**Picture this:** 2-3 sentences painting the scene in visual detail — colors, light, expressions, mood — so a young artist can see it before they draw.
**Try drawing:** a friendly nudge of what to include (e.g., "a big round moon", "three sleepy trees").

Keep language warm and simple. Celebrate wonder. Never say "this document".`;

  const user = `Story: ${doc.title}\n\n${excerpt}`;
  const prompts = await aiComplete(system, user);

  await logActivity({ type: "ai_imagine", documentId, detail: doc.title });
  return NextResponse.json({ prompts });
}
