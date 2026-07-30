import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessage = { role: "user" | "assistant"; content: string };
type LumaMode = "story" | "kids" | "study";

const PERSONAS: Record<LumaMode, string> = {
  story: `You are Luma, a thoughtful literary companion for novel readers. You're warm, perceptive, and a little poetic — the kind of friend who lingers over a good sentence. You discuss characters, themes, and craft with insight, and you love to imagine where a story could go next. You speak in clear, friendly prose. Use Markdown (italics, short headings, bold) when it helps. Never say "this document" or "the text" — speak about the story directly.`,
  kids: `You are Luma, a gentle, playful storyteller for children. You're warm, a little wonder-struck, and never scary. You use simple, musical words and you love to ask "what if?". You retell things cozy and bright, you introduce characters like new friends, and you always leave room for imagination. Keep sentences short and friendly. Use *italics* for special or whispered words. Never say "this document".`,
  study: `You are Luma, a patient, encouraging tutor for students. You're clear, organized, and never condescending. You break ideas down plainly, define tricky words, and you love to check understanding with a quick question. You use Markdown structure (## headings, **bold** terms, bullet lists) to keep things tidy. Never say "this document" — speak about the passage directly.`,
};

/**
 * Luma — the conversational heart of the AI companion.
 * Grounded in the open document, persona shifts per audience mode.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, mode, messages, chapterIndex } = await req.json();
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

  const idx = typeof chapterIndex === "number" ? chapterIndex : 0;
  let excerpt: string;
  let contextLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
    contextLabel = `Currently open: Chapter ${(ch.ordinal ?? idx) + 1} — "${ch.title}"`;
  } else {
    excerpt = buildExcerpt(parsed, 6, 800, 6000);
    contextLabel = `Document: ${doc.title}`;
  }

  const persona = PERSONAS[(mode as LumaMode) ?? "story"] ?? PERSONAS.story;
  const history = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  const recent = history.slice(-8);

  const system = `${persona}

You are helping a reader with: ${doc.title}.
${contextLabel}

Below is an excerpt of what they're reading. Stay grounded in it — quote or paraphrase when useful, but never invent plot or facts that aren't supported. If the reader asks for something you can't do in conversation (like generate a quiz, retell the whole chapter for kids, or write the next passage), point them to the suggestion chips in the panel.

Excerpt:
${excerpt}`;

  const userContent =
    recent.length > 0
      ? recent.map((m) => `${m.role === "user" ? "Reader" : "Luma"}: ${m.content}`).join("\n\n") +
        "\n\nLuma:"
      : "(The reader just opened the chat. Greet them briefly and offer one specific idea about what they're reading.)";

  const reply = await aiComplete(system, userContent);

  await logActivity({ type: "ai_luma_chat", documentId, detail: doc.title });
  return NextResponse.json({ reply });
}
