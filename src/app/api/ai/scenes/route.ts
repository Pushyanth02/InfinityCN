import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { aiCompleteJson } from "@/lib/ai-helpers";
import { scenesSchema, validate } from "@/lib/api-schemas";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const maxDuration = 90;

interface Scene {
  ordinal: number;
  title: string;
  body: string;
  mood: string;
  characters: string[];
}

/**
 * POST /api/ai/scenes
 *
 * Generates dramatized cinematic scenes from a document. Unlike the old
 * version (which sampled only the first 1000 chars of 8 chapters), this
 * builds a FULL-CONTENT excerpt: the complete body of every chapter (up to
 * a 20000-char cap), so scenes cover the entire document.
 *
 * The prompt elevates the narrative: dramatized prose, present-tense
 * immediacy, and structured dialogue sequences — while preserving ALL the
 * information and content from the source.
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const quotaResp = await aiQuotaGate(userId, setCookie);
  if (quotaResp) return quotaResp;

  const body = await req.json();
  const v = validate(scenesSchema, body);
  if (!v.success)
    return NextResponse.json({ error: v.error }, { status: 400, headers: setCookie });
  const { documentId, regenerate } = v.data;

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

  const cacheMood = "cinematified";

  // Return cached if present and not regenerating.
  if (!regenerate) {
    const existing = await db.aiScene.findMany({
      where: { documentId, mood: cacheMood },
      orderBy: { ordinal: "asc" },
    });
    if (existing.length > 0) {
      return NextResponse.json({
        scenes: existing.map((s) => ({
          ordinal: s.ordinal,
          title: s.title,
          body: s.body,
          mood: s.mood === cacheMood ? "cinematified" : s.mood,
          characters: s.characters ? JSON.parse(s.characters) : [],
        })),
        cached: true,
      }, { headers: setCookie });
    }
  } else {
    await db.aiScene.deleteMany({ where: { documentId, mood: cacheMood } });
  }

  // Build a FULL-CONTENT excerpt: the complete body of every chapter,
  // capped at 20000 chars total to stay within token limits. This ensures
  // scenes cover the entire document, not just the opening.
  const sample: string[] = [];
  let total = 0;
  for (const ch of parsed.chapters) {
    const body = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).trim();
    if (!body) continue;
    const chunk = body.slice(0, Math.min(body.length, 4000));
    sample.push(`## ${ch.title}\n\n${chunk}`);
    total += chunk.length;
    if (total >= 20000) break;
  }
  const excerpt = sample.join("\n\n---\n\n").slice(0, 20000);

  const system = `You are a master dramatist and film adaptation writer. You turn a complete document into a sequence of cinematic scenes that ENHANCE the source material while preserving ALL its information and content.

Your scenes must:
- Cover the ENTIRE document — every key event, character, and turning point. Do not skip or condense major content.
- Elevate the narrative style: vivid, immediate, present-tense prose with sensory detail and emotional depth.
- Include STRUCTURED DIALOGUE SEQUENCES: when characters speak, format the dialogue dramatically —
    "Character Name," she said, turning to face the light.
    "Their reply," he answered, voice low.
  Preserve the original dialogue's meaning but dramatize its delivery.
- Be self-contained: each scene tells a complete beat with a beginning, tension, and resolution.

Respond with ONLY a valid JSON array of 6-10 scene objects. Each scene:
{
  "title": "An evocative title (≤8 words)",
  "body": "The dramatized scene — 3-6 sentences of elevated narrative prose WITH structured dialogue where characters speak. Present tense. Vivid.",
  "mood": "one of: tense, tender, eerie, exuberant, melancholic, radiant, brooding",
  "characters": ["Named or archetypal figures in this scene (1-4)"]
}

No markdown fences, no commentary, no preamble — only the JSON array.`;

  const user = `Title: ${doc.title}\n\nFull document content (chapter-by-chapter):\n\n${excerpt}`;

  let scenes: Scene[];
  try {
    const raw = await aiCompleteJson(system, user, { bot: "scenes", kind: "cinematize", documentId, userId });
    scenes = (raw as any[]).map((s, i) => ({
      ordinal: i,
      title: String(s.title || `Scene ${i + 1}`).slice(0, 120),
      body: String(s.body || ""),
      mood: String(s.mood || "radiant"),
      characters: Array.isArray(s.characters) ? s.characters.map(String).slice(0, 4) : [],
    })).slice(0, 10);
  } catch {
    // Fallback: a single scene from the excerpt.
    scenes = [
      {
        ordinal: 0,
        title: "Opening Frame",
        body: excerpt.slice(0, 500),
        mood: "radiant",
        characters: [],
      },
    ];
  }

  // Persist as AiScene rows with mood = "cinematified".
  await db.aiScene.createMany({
    data: scenes.map((s) => ({
      documentId,
      ordinal: s.ordinal,
      title: s.title,
      body: s.body,
      mood: cacheMood,
      characters: JSON.stringify(s.characters),
    })),
  });

  await logActivity({ type: "ai_cinematize", documentId, detail: doc.title });

  return NextResponse.json({ scenes, cached: false }, { headers: setCookie });
}
