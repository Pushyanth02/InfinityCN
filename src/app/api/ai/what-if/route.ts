import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** What If? — playful hypothetical scenarios that spark imagination. */
export async function POST(req: NextRequest) {
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

  const excerpt = buildExcerpt(parsed, 6, 800, 7000);

  const system = `You are a mischievous, delightful "what if" machine for stories. Given a text, invent 5 playful hypothetical scenarios that twist the story and spark a reader's imagination.

Each scenario as a Markdown section:
## What if…?
Then 2-3 sentences exploring what might happen — with humor, wonder, and surprise. Vary the tone: some funny, some spooky, some heartwarming.

Examples of the spirit: "What if the villain was secretly lonely?" "What if it rained stars instead of water?" "What if the hero could hear the narrator?"

Use **bold** for the key twist. Never say "this document".`;

  const user = `Story: ${doc.title}\n\n${excerpt}`;
  const scenarios = await aiComplete(system, user);

  await logActivity({ type: "ai_whatif", documentId, detail: doc.title });
  return NextResponse.json({ scenarios });
}
