import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** World & Lore — expands on the setting, history, and rules of the story's world. */
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

  const excerpt = buildExcerpt(parsed, 8, 1000, 10000);

  const system = `You are a worldbuilding companion for readers and writers. From the supplied text, infer and imaginatively expand the world the story inhabits.

Cover these facets as short Markdown sections (use ## headings):
- **The Place** — geography, architecture, atmosphere
- **The Time** — era, season, sense of history
- **The Rules** — the social, magical, or technological laws that govern this world
- **The People** — cultures, factions, daily life
- **The Lore** — legends, backstory, and untold history hinted at by the text

Each section: 3-5 sentences. Be vivid and specific, grounded in evidence from the text, but free to imagine what the text implies. Never contradict the source. Use Markdown for structure and emphasis.`;

  const user = `Title: ${doc.title}\n\n${excerpt}`;
  const lore = await aiComplete(system, user);

  await logActivity({ type: "ai_world", documentId, detail: doc.title });
  return NextResponse.json({ lore });
}
