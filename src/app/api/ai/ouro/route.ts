import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete, aiCompleteJson } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Ouro — the Study Buddy (NotebookLM-style).
 * One route, three tools via the `tool` param:
 *   - tool=chat       → conversational tutoring grounded in the doc
 *   - tool=quiz        → 6 multiple-choice questions (JSON)
 *   - tool=flashcards  → 8-12 Q/A flashcards (JSON)
 *   - tool=guide       → a structured Markdown study guide
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ouro);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Ouro needs a moment to catch its breath — try again soon.", bot: "ouro" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, tool = "chat", messages, chapterIndex } = await req.json();
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

  // Build a study-grounded excerpt. Ouro gets a generous 6000 chars.
  const idx = typeof chapterIndex === "number" ? chapterIndex : 0;
  let excerpt: string;
  let scopeLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    scopeLabel = `Chapter ${(ch.ordinal ?? idx) + 1}: ${ch.title}`;
  } else {
    excerpt = buildExcerpt(parsed, 6, 900, 6000);
    scopeLabel = doc.title;
  }

  /* ── tool=chat — conversational tutoring ── */
  if (tool === "chat") {
    const system = `You are Ouro, an advanced study assistant (think NotebookLM for literature). You're precise, structured, and endlessly patient. You help students genuinely understand a text.

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
    const recent = history.slice(-6);
    const userContent =
      recent.length > 0
        ? recent.map((m) => `${m.role === "user" ? "Student" : "Ouro"}: ${m.content}`).join("\n\n") + "\n\nOuro:"
        : "(The student just opened Ouro. Greet them briefly and offer to help them study this passage.)";

    const reply = await aiComplete(system, userContent, { bot: "ouro", kind: "chat", documentId });
    await logActivity({ type: "ai_ouro_chat", documentId, detail: doc.title });
    return NextResponse.json({ reply, bot: "ouro" });
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

    const reply = await aiComplete(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "study_guide", documentId });
    await logActivity({ type: "ai_ouro_guide", documentId, detail: doc.title });
    return NextResponse.json({ guide: reply, scope: scopeLabel, bot: "ouro" });
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
    const questions = await aiCompleteJson(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "quiz", documentId });
    await logActivity({ type: "ai_ouro_quiz", documentId, detail: doc.title });
    return NextResponse.json({ questions, scope: scopeLabel, bot: "ouro" });
  }

  /* ── tool=flashcards — 8-12 Q/A cards (JSON) ── */
  if (tool === "flashcards") {
    const system = `You are Ouro. Create 8-12 study flashcards from the passage. Each card has a concise question on the front and a brief answer on the back.

Return ONLY a JSON array (no markdown fences). Each element:
{ "front": "the question", "back": "a 1-2 sentence answer" }
Cover key facts, definitions, and concepts. Grounded in the passage only.`;
    const cards = await aiCompleteJson<{ front: string; back: string }>(system, `Passage — ${scopeLabel}:\n\n${excerpt}`, { bot: "ouro", kind: "flashcards", documentId });
    await logActivity({ type: "ai_ouro_flash", documentId, detail: doc.title });
    return NextResponse.json({ flashcards: cards, scope: scopeLabel, bot: "ouro" });
  }

  return NextResponse.json({ error: "Unknown tool. Use chat, quiz, flashcards, or guide." }, { status: 400 });
}
