import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete } from "@/lib/ai-helpers";
import { safeErrorMessage } from "@/lib/safe-error";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership, checkUserQuota } from "@/lib/quota";
import type { ParsedDoc } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Background AI analysis job for a document.
 *
 * Pipeline (sequential, each step updates progress + ETA):
 *   1. Denoise  — remove OCR artifacts, fix spacing, deduplicate content
 *   2. Summary  — a comprehensive document summary
 *   3. Themes   — central themes and their development
 *   4. Characters — character analysis
 *   5. Criticism — literary criticism (style, voice, structure)
 *
 * POST starts the job (fire-and-forget) and returns immediately with the
 * job status + ETA. GET polls the status. Results are stored as JSON in
 * AnalysisJob.results and surfaced when status = "done".
 */

const STEPS = ["denoise", "summary", "themes", "characters", "criticism"] as const;
const STEP_LABELS: Record<string, string> = {
  denoise: "Cleaning and denoising text",
  summary: "Writing the summary",
  themes: "Analyzing themes",
  characters: "Analyzing characters",
  criticism: "Applying literary criticism",
};

/** Estimate total ETA from chapter count (each step ~10-15s). */
function estimateEta(chapterCount: number): number {
  return Math.max(30, Math.min(180, chapterCount * 8 + 40));
}

/** Run the full analysis pipeline as a background job. */
async function runAnalysis(documentId: string, userId?: string) {
  const job = await db.analysisJob.findUnique({ where: { documentId } });
  if (!job) return;
  const startedAt = Date.now();

  try {
    await db.analysisJob.update({
      where: { documentId },
      data: { status: "running", step: "denoise", progress: 5, updatedAt: new Date() },
    });

    const doc = await db.document.findUnique({ where: { id: documentId } });
    if (!doc || !doc.contentJson) throw new Error("Document not ready");
    let parsed: ParsedDoc = JSON.parse(doc.contentJson);

    const results: Record<string, string> = {};

    // ── Step 1: Denoise ──
    // Build a full excerpt and ask the AI to clean it: remove noise,
    // duplication, and OCR artifacts while preserving all content.
    const rawExcerpt = buildExcerpt(parsed, 12, 1500, 18000);
    const denoised = await aiComplete(
      `You are a text-restoration specialist. Clean the supplied text thoroughly:
- Remove OCR artifacts, ligature errors, and encoding glitches
- Fix broken spacing, hyphenation, and punctuation
- Remove duplicate paragraphs and boilerplate repetition
- Preserve ALL original content, meaning, italics, quotes, and foreign scripts
- Do NOT summarize or condense — keep every piece of information

Return ONLY the cleaned text, no commentary.`,
      `Document: ${doc.title}\n\n${rawExcerpt}`,
      { bot: "analysis", kind: "denoise", documentId, userId },
    );
    results.denoised = denoised.slice(0, 16000);
    await db.analysisJob.update({
      where: { documentId },
      data: { step: "summary", progress: 25, updatedAt: new Date() },
    });

    // ── Step 2: Summary ──
    const summary = await aiComplete(
      `You are a literary analyst. Write a comprehensive, evocative summary of the supplied text. 2-3 paragraphs of plain prose. Cover the full arc — beginning, middle, and end. No headings. Do not say "this document".`,
      `Title: ${doc.title}\n\n${results.denoised}`,
      { bot: "analysis", kind: "summary", documentId, userId },
    );
    results.summary = summary;
    // Persist the summary on the document for quick access.
    await db.document.update({ where: { id: documentId }, data: { summary } });
    await db.analysisJob.update({
      where: { documentId },
      data: { step: "themes", progress: 45, updatedAt: new Date() },
    });

    // ── Step 3: Themes ──
    const themes = await aiComplete(
      `You are a thematic analyst. Identify 3-5 central themes in the supplied text. For each, name the theme, describe how it develops, and note a key moment. Use Markdown (## theme headings, **bold** for key terms). Grounded in the text only.`,
      `Title: ${doc.title}\n\n${results.denoised}`,
      { bot: "analysis", kind: "themes", documentId, userId },
    );
    results.themes = themes;
    await db.analysisJob.update({
      where: { documentId },
      data: { step: "characters", progress: 65, updatedAt: new Date() },
    });

    // ── Step 4: Characters ──
    const characters = await aiComplete(
      `You are a character analyst. Analyze the key characters in the supplied text. For each, cover personality, motivations, relationships, and arc. Use Markdown (## character headings). 3-5 sentences per character. Grounded in the text only.`,
      `Title: ${doc.title}\n\n${results.denoised}`,
      { bot: "analysis", kind: "characters", documentId, userId },
    );
    results.characters = characters;
    await db.analysisJob.update({
      where: { documentId },
      data: { step: "criticism", progress: 80, updatedAt: new Date() },
    });

    // ── Step 5: Criticism ──
    const criticism = await aiComplete(
      `You are a literary critic. Evaluate the supplied text: prose style, narrative voice, imagery/symbolism, structure, and authorial intent. Use Markdown (## section headings, **bold** terms). 4-6 paragraphs. Grounded in the text only.`,
      `Title: ${doc.title}\n\n${results.denoised}`,
      { bot: "analysis", kind: "criticism", documentId, userId },
    );
    results.criticism = criticism;

    // ── Done ──
    await db.analysisJob.update({
      where: { documentId },
      data: {
        status: "done",
        step: null,
        progress: 100,
        results: JSON.stringify(results),
        updatedAt: new Date(),
      },
    });
    await logActivity({ type: "ai_analysis_complete", documentId, detail: doc.title });
  } catch (err: any) {
    await db.analysisJob.update({
      where: { documentId },
      data: {
        status: "error",
        error: safeErrorMessage(err, "Analysis failed"),
        updatedAt: new Date(),
      },
    });
  }
}

/** POST — start (or resume polling) the analysis job. */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const { documentId } = await req.json();
  if (!documentId || !isValidDocumentId(documentId))
    return NextResponse.json({ error: "Valid documentId required" }, { status: 400, headers: setCookie });

  // Enforce ownership — a user can only analyze their own documents.
  const doc = await verifyDocumentOwnership(documentId, userId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });
  if (doc.status !== "ready")
    return NextResponse.json({ error: "Document not ready" }, { status: 400, headers: setCookie });

  // Per-user quota — the pipeline fires several AI calls, so gate on it.
  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit}). Try again later.` },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
    );
  }

  // Check for an existing job.
  const existing = await db.analysisJob.findUnique({ where: { documentId } });
  if (existing) {
    // If done or running, return the current status (don't restart).
    if (existing.status === "running" || existing.status === "done") {
      return NextResponse.json({
        jobId: existing.id,
        status: existing.status,
        step: existing.step,
        stepLabel: existing.step ? STEP_LABELS[existing.step] ?? existing.step : null,
        progress: existing.progress,
        etaSeconds: existing.etaSeconds,
        results: existing.results ? JSON.parse(existing.results) : null,
        error: existing.error,
      }, { headers: setCookie });
    }
    // If errored, delete and restart.
    await db.analysisJob.delete({ where: { documentId } });
  }

  // Create a new job.
  let parsed: ParsedDoc | null = null;
  try {
    parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
  } catch {
    // ignore
  }
  const chapterCount = parsed?.chapters.length ?? 1;
  const eta = estimateEta(chapterCount);

  const job = await db.analysisJob.create({
    data: { documentId, userId, status: "queued", progress: 0, etaSeconds: eta },
  });

  // Fire-and-forget the analysis pipeline.
  void runAnalysis(documentId, userId);

  return NextResponse.json({
    jobId: job.id,
    status: "queued",
    step: null,
    stepLabel: null,
    progress: 0,
    etaSeconds: eta,
    results: null,
    error: null,
  }, { headers: setCookie });
}

/** GET — poll the analysis job status. */
export async function GET(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId || !isValidDocumentId(documentId))
    return NextResponse.json({ error: "Valid documentId required" }, { status: 400, headers: setCookie });

  // Enforce ownership — a user can only poll jobs for their own documents.
  const owned = await verifyDocumentOwnership(documentId, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404, headers: setCookie });

  const job = await db.analysisJob.findUnique({ where: { documentId } });
  if (!job) return NextResponse.json({ error: "No analysis job" }, { status: 404, headers: setCookie });

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    step: job.step,
    stepLabel: job.step ? STEP_LABELS[job.step] ?? job.step : null,
    progress: job.progress,
    etaSeconds: job.etaSeconds,
    results: job.results ? JSON.parse(job.results) : null,
    error: job.error,
  }, { headers: setCookie });
}
