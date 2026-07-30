import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";
import { chatCompletionCompat } from "@/lib/ai-client";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const { documentId, chapterIndex } = await req.json();
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

  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText || ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 8000);
    scopeLabel = `Chapter ${chapterIndex + 1}: ${ch.title}`;
  } else {
    const sample: string[] = [];
    for (const ch of parsed.chapters.slice(0, 6)) {
      sample.push(`## ${ch.title}`);
      sample.push((ch.chunks[0]?.text ?? "").slice(0, 800));
    }
    excerpt = sample.join("\n\n").slice(0, 8000);
    scopeLabel = "the full work";
  }

  const completion = await chatCompletionCompat({
    messages: [
      {
        role: "assistant",
        content: `You are a dialogue analyst. Analyze the dialogue in the following text from {SCOPE}. Evaluate conversational structures, context, and tone.

For each significant exchange, identify:
- The speaker and the recipient (if discernible)
- The tone (e.g., confrontational, tender, evasive, authoritative)
- What the exchange reveals about the relationship or power dynamic
- The subtext (what is left unsaid)

Format your response as a series of short analyses, each starting with the speakers involved. Use plain prose, 3-5 sentences per exchange. Do not use JSON. Focus on dialogue only — do not narrate the plot.`.replace("{SCOPE}", scopeLabel),
      },
      { role: "user", content: `Title: ${doc.title}\n\n${excerpt}` },
    ],
  }, { bot: "system", kind: "dialogue", documentId, userId });
  const analysis = completion.choices[0]?.message?.content?.trim() ?? "";

  await logActivity({ type: "ai_dialogue", documentId, detail: doc.title });
  return NextResponse.json({ analysis, scope: scopeLabel }, { headers: setCookie });
}
