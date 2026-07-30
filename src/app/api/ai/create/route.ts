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
 * POST /api/ai/create — consolidated creative endpoint.
 *
 * Replaces 7 individual routes (continue-story, alternate-ending, world-lore,
 * retell-kids, meet-characters, what-if, imagine-picture) with a single
 * task-registry route.
 *
 * Body: { documentId?, task, chapterIndex?, twist? }
 *   task: "continue" | "ending" | "world" | "retell-kids" | "meet" |
 *         "what-if" | "imagine"
 */

const CREATE_SCHEMA = z.object({
  documentId: z.string().regex(/^[a-z0-9]{20,30}$/i, "Invalid document ID").optional(),
  task: z.enum(["continue", "ending", "world", "retell-kids", "meet", "what-if", "imagine"]),
  chapterIndex: z.number().int().min(0).optional(),
  twist: z.string().max(2000).optional(),
});

const TASK_PROMPTS: Record<string, { system: string; field: string; activityType: string }> = {
  continue: {
    field: "continuation",
    activityType: "ai_continue",
    system: `You are a gifted ghostwriter continuing a novel in the author's own voice. Read the chapter closely — absorb its style, rhythm, imagery, and tone. Write the NEXT passage (250-400 words). Write only the continuation — no headings, no preamble. Use *italics* for emphasis.`,
  },
  ending: {
    field: "ending",
    activityType: "ai_ending",
    system: `You are an imaginative storyteller who reimagines how a story could end. Write a fresh, compelling ALTERNATE ENDING (300-500 words) that takes a meaningfully different path. Write only the new ending passage. Use *italics* for emphasis.`,
  },
  world: {
    field: "lore",
    activityType: "ai_world",
    system: `You are a worldbuilding companion. Cover: ## The Place, ## The Time, ## The Rules, ## The People, ## The Lore. 3-5 sentences each. Use **bold** for key terms. Grounded in the text.`,
  },
  "retell-kids": {
    field: "story",
    activityType: "ai_kids",
    system: `You are a warm storyteller for children (age 7-10). Retell the story as a cozy, wonder-filled tale. 200-350 words. Simple, musical sentences. Use *italics* for special words.`,
  },
  meet: {
    field: "intro",
    activityType: "ai_characters_intro",
    system: `You are a friendly guide introducing characters to a young reader. For each: ## Character Name, 2-3 sentences covering who they are, what makes them special, and their heart. Use **bold** for the key trait. 3-6 characters.`,
  },
  "what-if": {
    field: "scenarios",
    activityType: "ai_whatif",
    system: `You are a "what if" machine. Invent 5 playful hypothetical scenarios. Each: ## What if…? then 2-3 sentences. Vary tone: funny, spooky, heartwarming. Use **bold** for the twist.`,
  },
  imagine: {
    field: "prompts",
    activityType: "ai_imagine",
    system: `You are a children's art director. Pick 5 vivid moments a child could illustrate. Each: ## [Title], **The moment:** one sentence, **Picture this:** 2-3 sentences of visual detail, **Try drawing:** what to include. Keep language warm and simple.`,
  },
};

export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit})` },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
    );
  }

  let body: z.infer<typeof CREATE_SCHEMA>;
  try {
    body = CREATE_SCHEMA.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request" },
      { status: 400, headers: setCookie },
    );
  }

  const { documentId, task, chapterIndex, twist } = body;
  const taskDef = TASK_PROMPTS[task];
  if (!taskDef) {
    return NextResponse.json({ error: "Unknown task" }, { status: 400, headers: setCookie });
  }

  // Build excerpt — documentId is optional for some creative tasks.
  let excerpt = "";
  let docTitle = "an original work";
  if (documentId) {
    const doc = await verifyDocumentOwnership(documentId, userId);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
    if (doc.status !== "ready")
      return NextResponse.json({ error: "Document not ready" }, { status: 400, headers: setCookie });

    let parsed: ParsedDoc | null = null;
    try {
      parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
    } catch { /* ignore */ }
    if (!parsed) return NextResponse.json({ error: "No content" }, { status: 400, headers: setCookie });

    docTitle = doc.title;
    if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
      const ch = parsed.chapters[chapterIndex];
      excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 4000);
    } else {
      excerpt = buildExcerpt(parsed, 6, 800, 6000);
    }
  }

  try {
    const userContent = twist
      ? `Title: ${docTitle}\n\n${excerpt}\n\n---\n\nTwist to honor: ${twist}`
      : excerpt
        ? `Title: ${docTitle}\n\n${excerpt}`
        : `Write an original work.`;

    const result = await aiComplete(taskDef.system, userContent, {
      bot: "create",
      kind: task,
      documentId: documentId,
      userId,
    });

    if (documentId) {
      await logActivity({ type: taskDef.activityType, documentId, detail: docTitle });
    }

    const response: Record<string, unknown> = { task, result };
    response[taskDef.field] = result;
    return NextResponse.json(response, { headers: setCookie });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, "Creative task failed") },
      { status: 500, headers: setCookie },
    );
  }
}
