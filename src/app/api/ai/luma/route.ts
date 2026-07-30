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

/**
 * Luma — the Normal Chatbot.
 * Combines Story Time (warm, imaginative storytelling for all ages) with
 * Study Buddy-lite (clear explanations, vocabulary, quick analysis) into one
 * fast, high-quality companion. Optimized for low latency: tight excerpts,
 * short system prompt, last-6-turn history.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.luma);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Luma is busy — please try again in a moment.", bot: "luma" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { documentId, messages, chapterIndex } = await req.json();
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

  // Token-optimized: chapter-scoped (4000 chars) or whole-doc sample (4000).
  const idx = typeof chapterIndex === "number" ? chapterIndex : 0;
  let excerpt: string;
  let contextLabel: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 4000);
    contextLabel = `Currently open: Chapter ${(ch.ordinal ?? idx) + 1} — "${ch.title}"`;
  } else {
    excerpt = buildExcerpt(parsed, 4, 800, 4000);
    contextLabel = `Document: ${doc.title}`;
  }

  const system = `You are Luma, a radiant, fast-thinking reading companion. You blend two gifts:
- A storyteller's warmth — you retell passages vividly, imagine what-ifs, and expand the story for readers of any age.
- A tutor's clarity — you explain tricky ideas, define words, and summarize plainly.

Be concise and lively. Respond in 1-3 short paragraphs unless asked for more. Use Markdown (italics, **bold**, short bullets) when it helps. Stay grounded in the excerpt — never invent plot. If the reader wants a deep study session (quizzes, flashcards, full study guide), suggest switching to **Ouro**. If they want a long creative work (a new chapter, a full short story), suggest **Ankaa**.

You are helping with: ${doc.title}.
${contextLabel}

Excerpt:
${excerpt}`;

  const history = Array.isArray(messages) ? (messages as ChatMessage[]) : [];
  // Token optimization: last 6 turns only.
  const recent = history.slice(-6);

  const userContent =
    recent.length > 0
      ? recent.map((m) => `${m.role === "user" ? "Reader" : "Luma"}: ${m.content}`).join("\n\n") + "\n\nLuma:"
      : "(The reader just opened the chat. Greet them in one sentence and offer one specific, vivid idea about what they're reading.)";

  const reply = await aiComplete(system, userContent, { bot: "luma", kind: "chat", documentId });

  await logActivity({ type: "ai_luma_chat", documentId, detail: doc.title });
  return NextResponse.json({ reply, bot: "luma" });
}
