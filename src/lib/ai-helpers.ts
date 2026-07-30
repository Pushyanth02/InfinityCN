import type { ParsedDoc } from "@/lib/types";
import { db } from "@/lib/db";

/**
 * Build a representative text excerpt from a parsed document for AI prompts.
 * Token-optimized: caps per-chapter and total chars to keep prompts lean.
 */
export function buildExcerpt(
  parsed: ParsedDoc,
  maxChapters = 8,
  perChapter = 1000,
  totalMax = 10000,
): string {
  const sample: string[] = [];
  for (const ch of parsed.chapters.slice(0, maxChapters)) {
    sample.push(`## ${ch.title}`);
    sample.push((ch.chunks[0]?.text ?? "").slice(0, perChapter));
  }
  return sample.join("\n\n").slice(0, totalMax);
}

/** Chapter-scoped excerpt. */
export function buildChapterExcerpt(
  parsed: ParsedDoc,
  chapterIndex: number,
  perChapter = 4000,
): { title: string; excerpt: string; ok: boolean } {
  const ch = parsed.chapters[chapterIndex];
  if (!ch) return { title: "", excerpt: "", ok: false };
  const body = (ch.refinedText ?? ch.chunks.map((c) => c.text).join("\n\n")).slice(0, perChapter);
  return { title: ch.title, excerpt: `## ${ch.title}\n\n${body}`, ok: true };
}

/** Rough token estimate (~4 chars per token). Used for usage monitoring. */
export function estimateTokens(...parts: string[]): number {
  const total = parts.reduce((a, p) => a + p.length, 0);
  return Math.ceil(total / 4);
}

/**
 * Retry wrapper with exponential backoff. Retries on network/rate errors
 * from the AI provider. Returns the result or throws after max attempts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 800;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? err).toLowerCase();
      // Don't retry on client errors (4xx) except 429.
      const isRetryable =
        msg.includes("rate") ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("econnreset") ||
        msg.includes("socket") ||
        msg.includes("503") ||
        msg.includes("overloaded");
      if (!isRetryable || attempt === maxAttempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Lazy-load the Z.ai SDK and create a chat completion with retry + usage tracking.
 * Centralizes the dynamic import, retry logic, and usage monitoring.
 */
export async function aiComplete(
  systemPrompt: string,
  userContent: string,
  opts: { bot?: string; kind?: string; documentId?: string; userId?: string } = {},
): Promise<string> {
  const bot = opts.bot ?? "system";
  const kind = opts.kind ?? "chat";
  const started = Date.now();
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await withRetry(() =>
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        thinking: { type: "disabled" },
      }),
    );
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    const tokens = estimateTokens(systemPrompt, userContent, reply);
    await trackUsage({ bot, kind, documentId: opts.documentId, userId: opts.userId, tokensEstimate: tokens, latencyMs: Date.now() - started, status: "ok" }).catch(() => {});
    return reply;
  } catch (err) {
    await trackUsage({ bot, kind, documentId: opts.documentId, userId: opts.userId, tokensEstimate: estimateTokens(systemPrompt, userContent), latencyMs: Date.now() - started, status: "error" }).catch(() => {});
    throw err;
  }
}

/** JSON-array completion with retry + usage tracking. */
export async function aiCompleteJson<T>(
  systemPrompt: string,
  userContent: string,
  opts: { bot?: string; kind?: string; documentId?: string; userId?: string } = {},
): Promise<T[]> {
  const bot = opts.bot ?? "system";
  const kind = opts.kind ?? "json";
  const started = Date.now();
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await withRetry(() =>
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        thinking: { type: "disabled" },
      }),
    );
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    // Robust JSON extraction: strip code fences, find the first JSON array,
    // and tolerate trailing commas (a common AI output quirk).
    let cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    // If there's preamble text before the array, extract from the first '['.
    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      cleaned = cleaned.slice(arrStart, arrEnd + 1);
    }
    // Remove trailing commas before } or ] (invalid JSON but AI often emits).
    cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("AI did not return a JSON array");
    const tokens = estimateTokens(systemPrompt, userContent, raw);
    await trackUsage({ bot, kind, documentId: opts.documentId, userId: opts.userId, tokensEstimate: tokens, latencyMs: Date.now() - started, status: "ok" }).catch(() => {});
    return parsed as T[];
  } catch (err) {
    await trackUsage({ bot, kind, documentId: opts.documentId, userId: opts.userId, tokensEstimate: estimateTokens(systemPrompt, userContent), latencyMs: Date.now() - started, status: "error" }).catch(() => {});
    throw err;
  }
}

/** Fire-and-forget usage tracker. Writes a UsageEvent row for monitoring. */
export async function trackUsage(p: {
  bot: string;
  kind: string;
  documentId?: string;
  userId?: string;
  tokensEstimate: number;
  latencyMs: number;
  status: string;
}): Promise<void> {
  await db.usageEvent.create({
    data: {
      bot: p.bot,
      kind: p.kind,
      documentId: p.documentId ?? null,
      userId: p.userId ?? null,
      tokensEstimate: p.tokensEstimate,
      latencyMs: p.latencyMs,
      status: p.status,
    },
  });
}
