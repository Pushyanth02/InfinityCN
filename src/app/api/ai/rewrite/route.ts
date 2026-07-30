import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, chapterIndex, instructions } = await req.json();
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

  let passage: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    passage = (ch.refinedText || ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    scopeLabel = `Chapter ${chapterIndex + 1}: ${ch.title}`;
  } else {
    const ch = parsed.chapters[0];
    passage = (ch?.refinedText || ch?.chunks.map((c) => c.text).join("\n\n") || "").slice(0, 6000);
    scopeLabel = "the opening passage";
  }

  const toneInstruction = instructions?.trim()
    ? `\n\nThe user requests this specific tone/style: ${instructions.trim()}`
    : "";

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `You are an expert editor. Rewrite the following passage to enhance clarity, structure, grammar, and tone — while preserving the original meaning, voice, and narrative content.

Rules:
- Preserve the original meaning and all key information
- Maintain the author's voice and point of view
- Fix grammar, punctuation, and spelling errors
- Improve sentence flow and paragraph structure
- Tighten wordy passages without losing substance
- Preserve dialogue, quotations, and foreign-language terms
- Do not add new content or commentary
- Return ONLY the rewritten text — no headings, no explanations, no markdown${toneInstruction}`,
      },
      {
        role: "user",
        content: `Title: ${doc.title}\nPassage from ${scopeLabel}:\n\n${passage}`,
      },
    ],
    thinking: { type: "disabled" },
  });
  const rewritten = completion.choices[0]?.message?.content?.trim() ?? passage;

  await logActivity({ type: "ai_rewrite", documentId, detail: `${doc.title} — ${scopeLabel}` });
  return NextResponse.json({ rewritten, scope: scopeLabel, original: passage });
}
