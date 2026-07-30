import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";
import { safeErrorMessage } from "@/lib/safe-error";
import { z } from "zod";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/analyze — consolidated analysis endpoint.
 *
 * Replaces 11 individual routes (summarize, themes, characters, criticism,
 * semantic, story-summary, dialogue, rewrite, study-guide, vocabulary,
 * explain-simply) with a single task-registry route.
 *
 * Body: { documentId, task, chapterIndex?, instructions? }
 *   task: "summarize" | "themes" | "characters" | "criticism" | "semantic" |
 *         "story-summary" | "dialogue" | "rewrite" | "study-guide" |
 *         "vocabulary" | "explain-simply"
 *
 * All tasks go through aiComplete() for centralized retry, usage tracking,
 * and cost monitoring.
 */

const ANALYZE_SCHEMA = z.object({
  documentId: z.string().regex(/^[a-z0-9]{20,30}$/i, "Invalid document ID"),
  task: z.enum([
    "summarize", "themes", "characters", "criticism", "semantic",
    "story-summary", "dialogue", "rewrite", "study-guide",
    "vocabulary", "explain-simply",
  ]),
  chapterIndex: z.number().int().min(0).optional(),
  scope: z.enum(["chapter", "novel"]).optional(),
  regenerate: z.boolean().optional(),
  instructions: z.string().max(2000).optional(),
});

/** Task → system prompt registry. Each entry defines the AI persona + output. */
const TASK_PROMPTS: Record<string, { system: string; field: string; activityType: string }> = {
  summarize: {
    field: "summary",
    activityType: "ai_summarize",
    system: `You are a literary analyst. Write a tight, evocative summary. 2-3 short paragraphs of plain prose. No headings. Do not say "this document".`,
  },
  themes: {
    field: "analysis",
    activityType: "ai_themes",
    system: `You are a thematic analyst. Identify 3-5 central themes. Format each as a short section with the theme name as a ## heading. 3-4 sentences per theme. Use **bold** for key terms. Grounded in the text only.`,
  },
  characters: {
    field: "analysis",
    activityType: "ai_characters",
    system: `You are a character analyst. Analyze key characters — personality, motivations, relationships, arc. Use ## headings per character. 3-5 sentences each. Grounded in the text only.`,
  },
  criticism: {
    field: "analysis",
    activityType: "ai_criticism",
    system: `You are a literary critic. Evaluate prose style, narrative voice, imagery/symbolism, structure, and authorial intent. Use ## section headings. 4-6 paragraphs. Grounded in the text only.`,
  },
  semantic: {
    field: "analysis",
    activityType: "ai_semantic",
    system: `You are a semantic analyst. Interpret surface meaning, subtext, cultural/historical context, implications, and ambiguities. 4-6 paragraphs. Use **bold** labels. Grounded in the text only.`,
  },
  "story-summary": {
    field: "analysis",
    activityType: "ai_story_summary",
    system: `You are a narrative analyst. Condense the plotline: Inciting Incident, Rising Action, Climax, Falling Action, Resolution. Use **bold** labels. 3-5 sentences per section. Grounded in the text only.`,
  },
  dialogue: {
    field: "analysis",
    activityType: "ai_dialogue",
    system: `You are a dialogue analyst. Analyze conversational structures, context, and tone. Format as short analyses per exchange. 3-5 sentences each. Grounded in the text only.`,
  },
  rewrite: {
    field: "rewritten",
    activityType: "ai_rewrite",
    system: `You are an expert editor. Rewrite to enhance clarity, structure, grammar, and tone while preserving voice. Return ONLY the rewritten text — no headings, no explanations.`,
  },
  "study-guide": {
    field: "guide",
    activityType: "ai_study",
    system: `You are a study-guide author. Produce a structured guide with ## sections: Quick Summary, Key Points (bullets), Important Figures (bullets), Main Themes (bullets), Terms to Know (bullets), Discussion Questions (3 numbered). Use **bold** for key terms.`,
  },
  vocabulary: {
    field: "vocabulary",
    activityType: "ai_vocab",
    system: `You are a vocabulary tutor. Pick 8-12 notable words. For each: ### word (part of speech), **Definition:** one line, **In the text:** one sentence. Grounded in the text only.`,
  },
  "explain-simply": {
    field: "explanation",
    activityType: "ai_explain",
    system: `You are a clear explainer. Restate the text in simple, friendly language. ## In a nutshell (1-2 sentences), ## What's really going on (2-4 short paragraphs), ## Why it matters (one sentence). Never say "this document".`,
  },
};

export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  // Rate limit.
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  // Per-user quota.
  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit})` },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
    );
  }

  // Validate.
  let body: z.infer<typeof ANALYZE_SCHEMA>;
  try {
    body = ANALYZE_SCHEMA.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request" },
      { status: 400, headers: setCookie },
    );
  }

  const { documentId, task, chapterIndex, instructions } = body;

  // Verify ownership.
  const doc = await verifyDocumentOwnership(documentId, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
  if (doc.status !== "ready")
    return NextResponse.json({ error: "Document not ready" }, { status: 400, headers: setCookie });

  // Parse content.
  let parsed: ParsedDoc | null = null;
  try {
    parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
  } catch { /* ignore */ }
  if (!parsed) return NextResponse.json({ error: "No content" }, { status: 400, headers: setCookie });

  // Build excerpt (chapter-scoped or whole-doc).
  let excerpt: string;
  if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
    const ch = parsed.chapters[chapterIndex];
    excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 6000);
  } else {
    excerpt = buildExcerpt(parsed, 8, 1000, 10000);
  }

  const taskDef = TASK_PROMPTS[task];
  if (!taskDef) {
    return NextResponse.json({ error: "Unknown task" }, { status: 400, headers: setCookie });
  }

  // Run the AI task.
  try {
    const userContent = instructions
      ? `Title: ${doc.title}\n\n${excerpt}\n\n---\n\nAdditional instructions: ${instructions}`
      : `Title: ${doc.title}\n\n${excerpt}`;

    const result = await aiComplete(taskDef.system, userContent, {
      bot: "analyze",
      kind: task,
      documentId,
      userId,
    });

    // For summarize (novel scope), cache on the document.
    if (task === "summarize" && !chapterIndex) {
      await db.document.update({ where: { id: documentId }, data: { summary: result } });
    }

    await logActivity({ type: taskDef.activityType, documentId, detail: doc.title });

    const response: Record<string, unknown> = { task, result };
    response[taskDef.field] = result;
    return NextResponse.json(response, { headers: setCookie });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, "Analysis failed") },
      { status: 500, headers: setCookie },
    );
  }
}
