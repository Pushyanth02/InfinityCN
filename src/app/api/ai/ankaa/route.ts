import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidDocumentId } from "@/lib/security";
import { buildExcerpt, aiComplete, estimateTokens, trackUsage } from "@/lib/ai-helpers";
import { describeAiError } from "@/lib/ai-client";
import { ankaaSchema, validate } from "@/lib/api-schemas";
import type { ParsedDoc } from "@/lib/types";
import { ensureSession } from "@/lib/auth";
import { verifyDocumentOwnership } from "@/lib/quota";
import { aiQuotaGate } from "@/lib/ai-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ── In-memory job store (single-instance; suitable for this deployment) ── */
export interface AnkaaJob {
  jobId: string;
  documentId: string | null;
  docTitle: string;
  prompt: string;
  status: "running" | "complete" | "error";
  result: string | null;
  error: string | null;
  createdAt: number;
  completedAt: number | null;
  etaSeconds: number;
}

// Module-level store survives across requests in the same server process.
export const ankaaJobs = new Map<string, AnkaaJob>();

/** Generate a short job ID. */
function makeJobId(): string {
  return `ankaa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Estimate ETA for a long-form work (word target → seconds). */
function estimateEta(wordTarget: number): number {
  // Empirical: the model produces ~30-40 words/sec of long-form prose.
  return Math.max(15, Math.ceil(wordTarget / 30) + 5);
}

/** Keep the in-memory job store bounded: drop finished jobs after a TTL. */
const ANKAA_JOB_TTL_MS = 30 * 60_000; // 30 minutes
function pruneAnkaaJobs(): void {
  const now = Date.now();
  for (const [id, job] of ankaaJobs) {
    const finishedAt = job.completedAt ?? job.createdAt;
    if (job.status !== "running" && now - finishedAt > ANKAA_JOB_TTL_MS) {
      ankaaJobs.delete(id);
    } else if (job.status === "running" && now - job.createdAt > 10 * 60_000) {
      // Safety: abandon jobs that never completed after 10 minutes.
      ankaaJobs.delete(id);
    }
  }
}

/**
 * POST — start a long-form creative-writing job.
 * Body: { documentId, prompt, scope?: "chapter"|"novel", chapterIndex?, wordTarget? }
 * Returns immediately with { jobId, etaSeconds, wordTarget }.
 *
 * The job runs in the background (fire-and-forget) and stores its result in
 * the in-memory `ankaaJobs` map. The client polls GET to check progress.
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ankaa);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Ankaa is already weaving a long-form work — please wait for it to finish.", bot: "ankaa" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  const quotaResp = await aiQuotaGate(userId, setCookie);
  if (quotaResp) return quotaResp;

  const body = await req.json();
  const v = validate(ankaaSchema, body);
  if (!v.success)
    return NextResponse.json({ error: v.error }, { status: 400, headers: setCookie });
  const { documentId, prompt, chapterIndex, wordTarget } = v.data;

  // documentId is optional — Ankaa can write from the brief alone (blank canvas),
  // or ground itself in an existing document if one is provided.
  let excerpt = "";
  let scopeLabel = "an original work";
  if (documentId && isValidDocumentId(documentId)) {
    const doc = await verifyDocumentOwnership(documentId, userId);
    if (doc && doc.status === "ready") {
      let parsed: ParsedDoc | null = null;
      try {
        parsed = doc.contentJson ? JSON.parse(doc.contentJson) : null;
      } catch {
        // ignore
      }
      if (parsed) {
        const idx = typeof chapterIndex === "number" ? chapterIndex : 0;
        if (typeof chapterIndex === "number" && parsed.chapters[chapterIndex]) {
          const ch = parsed.chapters[chapterIndex];
          excerpt = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, 8000);
          scopeLabel = `Chapter ${(ch.ordinal ?? idx) + 1}: ${ch.title} of ${doc.title}`;
        } else {
          excerpt = buildExcerpt(parsed, 8, 1200, 8000);
          scopeLabel = doc.title;
        }
      }
    }
  }

  const words = Math.min(4000, Math.max(300, typeof wordTarget === "number" ? wordTarget : 800));
  const eta = estimateEta(words);
  pruneAnkaaJobs();
  const jobId = makeJobId();

  const job: AnkaaJob = {
    jobId,
    documentId: documentId ?? null,
    docTitle: scopeLabel,
    prompt: prompt.trim(),
    status: "running",
    result: null,
    error: null,
    createdAt: Date.now(),
    completedAt: null,
    etaSeconds: eta,
  };
  ankaaJobs.set(jobId, job);

  // Fire-and-forget the long-form generation.
  (async () => {
    const started = Date.now();
    try {
      const sourceBlock = excerpt
        ? `Source material for tone and context — ${scopeLabel}:\n\n${excerpt}`
        : `This is an original work (no source document). Build the world, characters, and voice from the brief alone.`;

      const system = `You are Ankaa, a masterful creative-writing agent specializing in rich, long-form storytelling. You write with vivid sensory detail, layered characters, and a strong narrative voice. ${excerpt ? "You draw on the supplied source material for tone, setting, and characters, but you're free to imagine deeply." : "You invent freely from the brief."}

CRITICAL — narrative structure:
- Begin at the TRUE START of the story or chapter — an opening that grounds the reader in a moment, a place, a sensation. Never start mid-scene or mid-paragraph.
- Progress through a clear arc: opening → rising tension → turning point → resolution (or a deliberate, satisfying open end). Each paragraph should advance the narrative forward, not circle or repeat.
- End at a natural close — a completed beat, a resonant image, or a cliffhanger that earns its weight. Do not stop mid-sentence or mid-thought.
- If the brief asks for "the next chapter" or a continuation, pick up seamlessly from where the source leaves off, then build to your own beginning–middle–end.
- Vary your openings: don't always begin with weather or a character waking. Vary point of view, tense, and imagery across different requests.

Write approximately ${words} words. Use paragraph breaks to signal scene or beat changes. You may use *italics* for emphasis. Do not use headings unless the work is explicitly episodic. Do not include preamble, notes, or "here is your story" — begin the narrative directly and sustain it to a real ending.

${sourceBlock}`;

      const user = `Creative brief: ${prompt.trim()}

Write the complete work now, from its true beginning to its natural end.`;

      const result = await aiComplete(system, user, {
        bot: "ankaa",
        kind: "longform",
        documentId,
        userId,
        // Long-form needs a generous output budget (~2 tokens/word + buffer)
        // and a higher temperature for creative variety.
        maxTokens: Math.ceil(words * 2) + 600,
        temperature: 0.9,
      });
      const stored = ankaaJobs.get(jobId);
      if (stored) {
        stored.status = "complete";
        stored.result = result;
        stored.completedAt = Date.now();
      }
      await logActivity({ type: "ai_ankaa_complete", documentId: (documentId && isValidDocumentId(documentId)) ? documentId : undefined, detail: `${scopeLabel} (${words}w)`, userId });
    } catch (err: any) {
      const stored = ankaaJobs.get(jobId);
      if (stored) {
        stored.status = "error";
        stored.error = describeAiError(err).message;
        stored.completedAt = Date.now();
      }
      await trackUsage({ bot: "ankaa", kind: "longform", documentId, tokensEstimate: estimateTokens(prompt), latencyMs: Date.now() - started, status: "error" }).catch(() => {});
    }
  })();

  return NextResponse.json({ jobId, etaSeconds: eta, wordTarget: words, bot: "ankaa" }, { headers: setCookie });
}

/**
 * GET — poll a job's status.
 * Query: ?jobId=ankaa_...
 * Returns { status, result?, error?, elapsedSeconds, etaSeconds }
 */
export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId || !ankaaJobs.has(jobId))
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  const job = ankaaJobs.get(jobId)!;
  const elapsed = Math.ceil((Date.now() - job.createdAt) / 1000);
  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    result: job.result,
    error: job.error,
    elapsedSeconds: elapsed,
    etaSeconds: job.etaSeconds,
    prompt: job.prompt,
  });
}
