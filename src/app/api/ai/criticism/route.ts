import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const sample: string[] = [];
  for (const ch of parsed.chapters.slice(0, 8)) {
    sample.push(`## ${ch.title}`);
    sample.push((ch.chunks[0]?.text ?? "").slice(0, 1000));
  }
  const excerpt = sample.join("\n\n").slice(0, 10000);

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `You are a literary critic. Evaluate the style, symbolism, and authorial intent of the following text. Examine:

- **Prose style:** Diction, syntax, rhythm, register. How does the language shape the reading experience?
- **Narrative voice:** Point of view, reliability, distance, intimacy.
- **Imagery and symbolism:** Key images, recurring motifs, what they symbolize.
- **Structure:** How the work is built — chapter divisions, pacing, time handling.
- **Authorial intent:** What the author appears to be achieving through these craft decisions. What is the work *doing*?

4-6 paragraphs. Plain prose with the labels above. Be specific — cite phrases or passages from the text as evidence. Do not say "this document."`,
      },
      { role: "user", content: `Title: ${doc.title}\n\n${excerpt}` },
    ],
    thinking: { type: "disabled" },
  });
  const analysis = completion.choices[0]?.message?.content?.trim() ?? "";

  await logActivity({ type: "ai_criticism", documentId, detail: doc.title });
  return NextResponse.json({ analysis });
}
