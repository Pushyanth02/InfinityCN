import { isValidDocumentId } from "@/lib/security";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  const { documentId, question } = await req.json();
  if (!documentId || !question) {
    return NextResponse.json({ error: "documentId and question required" }, { status: 400 });
  }
  const doc = await verifyDocumentOwnership(documentId, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let parsed: ParsedDoc | null = null;
  try {
    parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
  } catch {
    // ignore
  }
  if (!parsed) return NextResponse.json({ error: "No content" }, { status: 400 });

  // Build a context window: try to find the most relevant chunks via simple keyword overlap,
  // fall back to the opening of each chapter.
  const q = question.toLowerCase();
  const terms = q.split(/\W+/).filter((t) => t.length > 2);
  const scored: { text: string; score: number; chapter: string }[] = [];
  for (const ch of parsed.chapters) {
    for (const c of ch.chunks) {
      const lower = c.text.toLowerCase();
      let score = 0;
      for (const t of terms) {
        const matches = lower.split(t).length - 1;
        score += matches;
      }
      scored.push({ text: c.text, score, chapter: ch.title });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 6);
  const context = (top.length > 0 ? top : parsed.chapters.flatMap((ch) => ch.chunks.slice(0, 1)).map((c) => ({ text: c.text, chapter: "", score: 0 })))
    .map((s) => `[${s.chapter || "—"}]\n${s.text.slice(0, 1200)}`)
    .join("\n\n---\n\n")
    .slice(0, 9000);

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You are a close-reading companion. Answer the reader's question using only the supplied excerpts. Quote a short phrase when it helps. If the excerpts don't contain the answer, say so plainly. 2-4 sentences, no headings.",
      },
      {
        role: "user",
        content: `Title: ${doc.title}\n\nExcerpts:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    thinking: { type: "disabled" },
  });
  const answer = completion.choices[0]?.message?.content?.trim() ?? "";
  return NextResponse.json({ answer, citations: top.slice(0, 3).map((s) => s.chapter) });
}
