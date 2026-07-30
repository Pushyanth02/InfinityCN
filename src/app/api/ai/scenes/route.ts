import { isValidDocumentId } from "@/lib/security";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 90;

interface SceneRequest {
  documentId: string;
  regenerate?: boolean;
}

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
 * Returns AI-enhanced cinematic scenes for a document. The AI reads a sample
 * of the document and produces 5-8 dramatized scene cards with evocative
 * titles, mood, characters, and present-tense body text. Results are cached
 * as AiScene rows with mood "cinematified".
 *
 * Body:
 *   - documentId: string
 *   - regenerate?: boolean (force re-generation, default false)
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const body: SceneRequest = await req.json();
  const { documentId, regenerate } = body;

  if (!documentId)
    return NextResponse.json({ error: "documentId required" }, { status: 400 });

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

  const cacheMood = "cinematified";

  // Return cached if present and not regenerating
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
      });
    }
  } else {
    await db.aiScene.deleteMany({
      where: { documentId, mood: cacheMood },
    });
  }

  // Build a content sample for the AI
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
        content:
          "You are a film adaptation scout. You turn prose into a sequence of cinematic scenes that dramatize and enhance the source material. Respond with ONLY valid JSON: an array of 5-8 scene objects. Each scene: { \"title\": string (≤8 words, evocative), \"body\": string (2-3 sentences, present tense, dramatized and vivid), \"mood\": string (one of: tense, tender, eerie, exuberant, melancholic, radiant, brooding), \"characters\": string[] (1-3 named or archetypal figures) }. No markdown fences, no commentary.",
      },
      { role: "user", content: `Title: ${doc.title}\n\n${excerpt}` },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
  let scenes: Scene[] = [];
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    scenes = JSON.parse(cleaned);
  } catch {
    scenes = [
      {
        ordinal: 0,
        title: "Opening Frame",
        body: raw.slice(0, 280),
        mood: "radiant",
        characters: [],
      },
    ];
  }
  scenes = scenes.slice(0, 8).map((s, i) => ({
    ordinal: i,
    title: s.title || `Scene ${i + 1}`,
    body: s.body || "",
    mood: s.mood || "radiant",
    characters: Array.isArray(s.characters) ? s.characters.slice(0, 3) : [],
  }));

  // Persist as AiScene rows with mood = "cinematified"
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

  return NextResponse.json({
    scenes,
    cached: false,
  });
}
