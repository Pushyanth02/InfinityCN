import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Meet the Characters — friendly, vivid character introductions (kid-friendly). */
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

  const { documentId } = await req.json();
  if (!documentId || !isValidDocumentId(documentId))
    return NextResponse.json({ error: "Valid documentId required" }, { status: 400, headers: setCookie });

  const doc = await verifyDocumentOwnership(documentId, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
  if (doc.status !== "ready")
    return NextResponse.json({ error: "Document not ready" }, { status: 400, headers: setCookie });

  let parsed: ParsedDoc | null = null;
  try {
    parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
  } catch {
    // ignore
  }
  if (!parsed) return NextResponse.json({ error: "No content" }, { status: 400 });

  const excerpt = buildExcerpt(parsed, 8, 900, 9000);

  const system = `You are a friendly guide introducing the characters of a story to a young reader. For each important character, write a warm, vivid introduction.

Format each character as a Markdown section:
## Character Name
A short, friendly description (2-3 sentences) covering:
- Who they are (in child-friendly terms)
- What makes them special or interesting
- A hint of their heart — what they want or feel

Use **bold** for the character's key trait. Keep language simple and affectionate. Cover 3-6 characters. Skip minor background figures. Never use the phrase "this document".`;

  const user = `Story: ${doc.title}\n\n${excerpt}`;
  const intro = await aiComplete(system, user, { bot: "system", kind: "meet_characters", documentId, userId });

  await logActivity({ type: "ai_characters_intro", documentId, detail: doc.title });
  return NextResponse.json({ intro }, { headers: setCookie });
}
