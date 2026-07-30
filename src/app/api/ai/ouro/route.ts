import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildExcerpt, aiComplete, aiCompleteJson } from "@/lib/ai-helpers";
import { describeAiError } from "@/lib/ai-client";
import { ouroSchema, validate } from "@/lib/api-schemas";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Ouro — the Study Buddy.
 * A literary study companion grounded in the reader's text. One route, four
 * tools via the `tool` param:
 *   - tool=chat       → conversational tutoring grounded in the doc
 *   - tool=quiz        → 6 multiple-choice questions (JSON)
 *   - tool=flashcards  → 8-12 Q/A flashcards (JSON)
 *   - tool=guide       → a structured Markdown study guide
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ouro);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Ouro needs a moment to catch its breath — try again soon.", bot: "ouro" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const quotaResp = await aiQuotaGate(userId, setCookie);
  if (quotaResp) return quotaResp;

  const body = await req.json();
  const v = validate(ouroSchema, body);
  if (!v.success)
    return NextResponse.json({ error: v.error }, { status: 400, headers: setCookie });
  const { documentId, tool = "chat", messages, chapterIndex } = v.data;

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

  // Build a study-grounded excerpt. Ouro gets a generous window for depth.
  const idx = typeof chapterIndex === "number" ? chapterIndex : 0;
  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 10000);
    scopeLabel = `Chapter ${(ch.ordinal ?? idx) + 1}: ${ch.title}`;
  } else {
    excerpt = buildExcerpt(parsed, 8, 1200, 10000);
    scopeLabel = doc.title;
  }

  try {
  /* ── tool=chat — conversational tutoring ── */
  if (tool === "chat") {
    const system = `You are Ouro, a literary study companion. You're precise, structured, and endlessly patient. You help readers genuinely understand a text — its language, its ideas, and its craft.

You can:
- Explain passages in plain language
- Define vocabulary in context
- Connect ideas across the text
- Probe understanding with a quick follow-up question

Use clear Markdown structure (## short headings, **bold** terms, bullet lists). Stay grounded in the excerpt — never invent facts. If a student wants a quiz, flashcards, or a full study guide, tell them to use the Ouro tool buttons.

Studying: ${doc.title} — ${scopeLabel}

Excerpt:
${excerpt}`;

    const history = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
    const recent = history.slice(-10);
    const userContent =
      recent.length > 0
        ? recent.map((m) => `${m.role === "user" ? "Student" : "Ouro"}: ${m.content}`).join("\n\n") + "\n\nOuro:"
        : "(The student just opened Ouro. Greet them briefly and offer to help them study this passage.)";

    const reply = await aiComplete(system, userContent, { bot: "ouro", kind: "chat", documentId, userId });
    await logActivity({ type: "ai_ouro_chat", documentId, detail: doc.title });
    return NextResponse.json({ reply, bot: "ouro" }, { headers: setCookie });
  }

  /* ── tool=guide — structured Markdown study guide ── */
  if (tool === "guide") {
    const system = `You are Ouro, a study-guide author. Produce a clear, well-organized study guide as Markdown.

Use these sections:
## Quick Summary
2-3 sentences.
## Key Points
5-8 bullets.
## Important Figures / Characters
2-4 bullets.
## Main Themes
3-5 bullets, each naming a theme + one sentence.
## Terms to Know
3-6 bullets with one-line definitions.
## Discussion Questions
3 numbered questions (no answers).

Be accurate and grounded. Use **bold** for key terms. Never say "this document".`;

    const reply = await aiComplete(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "study_guide", documentId, userId });
    await logActivity({ type: "ai_ouro_guide", documentId, detail: doc.title });
    return NextResponse.json({ guide: reply, scope: scopeLabel, bot: "ouro" }, { headers: setCookie });
  }

  /* ── tool=quiz — 6 multiple-choice questions (JSON) ── */
  if (tool === "quiz") {
    const system = `You are Ouro. Create 6 multiple-choice comprehension questions grounded in the supplied passage. Mix factual recall, inference, and vocabulary-in-context.

Return ONLY a JSON array (no markdown fences). Each element:
{
  "question": "...",
  "options": ["A","B","C","D"],
  "answerIndex": 0,
  "explanation": "one sentence why correct"
}
Exactly 4 options. answerIndex 0-3. Plausible distractors. Answerable from the passage.`;
    const questions = await aiCompleteJson(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "quiz", documentId, userId });
    await logActivity({ type: "ai_ouro_quiz", documentId, detail: doc.title });
    return NextResponse.json({ questions, scope: scopeLabel, bot: "ouro" }, { headers: setCookie });
  }

  /* ── tool=flashcards — 8-12 Q/A cards (JSON) ── */
  if (tool === "flashcards") {
    const system = `You are Ouro. Create 8-12 study flashcards from the passage. Each card has a concise question on the front and a brief answer on the back.

Return ONLY a JSON array (no markdown fences). Each element:
{ "front": "the question", "back": "a 1-2 sentence answer" }
Cover key facts, definitions, and concepts. Grounded in the passage only.`;
    const cards = await aiCompleteJson<{ front: string; back: string }>(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "flashcards", documentId, userId });
    await logActivity({ type: "ai_ouro_flash", documentId, detail: doc.title });
    return NextResponse.json({ flashcards: cards, scope: scopeLabel, bot: "ouro" }, { headers: setCookie });
  }

  return NextResponse.json({ error: "Unknown tool. Use chat, quiz, flashcards, or guide." }, { status: 400, headers: setCookie });
  } catch (err) {
    const e = describeAiError(err);
    return NextResponse.json(
      { error: e.message, bot: "ouro" },
      { status: e.status, headers: { ...setCookie, ...(e.retryAfterSec ? { "Retry-After": String(e.retryAfterSec) } : {}) } },
    );
  }
}
