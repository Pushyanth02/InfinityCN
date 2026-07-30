import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiCompleteJson } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface QuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

/** Quiz Me — generates multiple-choice comprehension questions. */
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
    excerpt = buildExcerpt(parsed, 6, 900, 8000);
    scopeLabel = doc.title;
  }

  const system = `You are a reading-comprehension quiz generator for students. Create 6 multiple-choice questions that test genuine understanding of the supplied text — a mix of factual recall, inference, and vocabulary-in-context.

Return ONLY a JSON array (no markdown fences, no commentary). Each element must be exactly:
{
  "question": "the question text",
  "options": ["A option", "B option", "C option", "D option"],
  "answerIndex": 0,
  "explanation": "one sentence explaining why the answer is correct"
}

Rules:
- Exactly 4 options per question
- answerIndex is 0-3
- Make distractors plausible, not silly
- Questions must be answerable from the text alone`;

  const user = `Text: ${scopeLabel}\n\n${excerpt}`;
  const questions = await aiCompleteJson<QuizQuestion>(system, user);

  await logActivity({ type: "ai_quiz", documentId, detail: doc.title });
  return NextResponse.json({ questions, scope: scopeLabel });
}
