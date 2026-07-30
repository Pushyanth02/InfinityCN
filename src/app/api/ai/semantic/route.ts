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
        content: `You are a semantic analyst. Derive meaning, implications, and nuanced understanding from the following text. Interpret:

- **Surface meaning:** What the text literally says.
- **Subtext:** What is implied but not stated directly.
- **Cultural/Historical context:** How the text reflects or responds to its context.
- **Implications:** What the text suggests for the reader or the world.
- **Ambiguities:** Points where meaning is uncertain or layered.

4-6 paragraphs total. Plain prose with the labels above. Do not say "this document" — speak about the work directly.`,
      },
      { role: "user", content: `Title: ${doc.title}\n\n${excerpt}` },
    ],
    thinking: { type: "disabled" },
  });
  const analysis = completion.choices[0]?.message?.content?.trim() ?? "";

  await logActivity({ type: "ai_semantic", documentId, detail: doc.title });
  return NextResponse.json({ analysis });
}
