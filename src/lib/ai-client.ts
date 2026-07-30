/**
 * Shared OpenRouter client for all Lemniscate AI features.
 *
 * OpenRouter exposes an OpenAI-compatible Chat Completions API, so this module
 * talks to it directly with `fetch` — no extra SDK dependency required.
 *
 * Configuration (environment variables):
 *   OPENROUTER_API_KEY        (required) — your OpenRouter key (starts with "sk-or-").
 *   OPENROUTER_BASE_URL       (optional) — defaults to https://openrouter.ai/api/v1
 *   OPENROUTER_MODEL          (optional) — default model for generic AI routes.
 *   OPENROUTER_MODEL_LUMA     (optional) — model for Luma (the Normal Chatbot / "Luna").
 *   OPENROUTER_MODEL_OURO     (optional) — model for Ouro (Study Buddy).
 *   OPENROUTER_MODEL_ANKAA    (optional) — model for Ankaa (long-form agent).
 *   OPENROUTER_FALLBACK_MODELS(optional) — comma-separated free models used for
 *                                          automatic fallback routing.
 *   OPENROUTER_SITE_URL / OPENROUTER_SITE_NAME (optional) — attribution headers.
 *
 * All defaults are FREE OpenRouter models (":free" / $0 per token). Each bot is
 * matched to a powerful free model suited to its job:
 *   - Luma  → a fast, efficient generalist for snappy chat.
 *   - Ouro  → a large frontier-reasoning model for study guides, quizzes, analysis.
 *   - Ankaa → a large model with a big output budget for long-form creative writing.
 */

import { checkGlobalAiBudget } from "@/lib/rate-limit";
import { estimateTokens, trackUsage } from "@/lib/usage";

export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";

/**
 * A Lemniscate-branded AI error. Its `message` is always safe to show to users
 * (no provider internals or secrets); the raw provider detail is kept in
 * `detail` for server-side logging only. `status` is the HTTP status a route
 * should return; `retryAfterSec` populates the Retry-After header when set.
 */
export class LemniscateAIError extends Error {
  status: number;
  retryAfterSec?: number;
  detail?: string;
  constructor(
    message: string,
    opts: { status?: number; retryAfterSec?: number; detail?: string } = {},
  ) {
    super(message);
    this.name = "LemniscateAIError";
    this.status = opts.status ?? 502;
    this.retryAfterSec = opts.retryAfterSec;
    this.detail = opts.detail;
  }
}

/** Raised when the account-wide free-tier daily budget is exhausted. */
export class AiBudgetError extends LemniscateAIError {
  constructor(message: string, retryAfterSec: number) {
    super(message, { status: 429, retryAfterSec });
    this.name = "AiBudgetError";
  }
}

/** Log provider detail server-side (dev only) without ever leaking it to users. */
function logAiDetail(detail: string): void {
  if (detail && process.env.NODE_ENV !== "production") {
    console.error("[Lemniscate AI] provider detail:", detail.slice(0, 500));
  }
}

/** Fast, capable generalist free model — good default for chat + utility routes. */
const DEFAULT_FREE_MODEL = "inclusionai/ling-3.0-flash:free";

/** Per-bot model selection. Each falls back to a sensible free default. */
export const BOT_MODELS: Record<string, string> = {
  // Luma = the user-facing "Luna": warm, fast, conversational.
  luma: process.env.OPENROUTER_MODEL_LUMA || DEFAULT_FREE_MODEL,
  // Ouro = Study Buddy: needs strong reasoning + reliable structured output.
  ouro: process.env.OPENROUTER_MODEL_OURO || "nvidia/nemotron-3-ultra-550b-a55b:free",
  // Ankaa = long-form creative agent: large context + large output budget.
  ankaa: process.env.OPENROUTER_MODEL_ANKAA || "nvidia/nemotron-3-super-120b-a12b:free",
  // Everything else (summaries, analysis, OCR refinement, creative helpers).
  system: process.env.OPENROUTER_MODEL || DEFAULT_FREE_MODEL,
};

/** Free models used for automatic fallback if the primary is busy/unavailable. */
const FREE_FALLBACKS: string[] = process.env.OPENROUTER_FALLBACK_MODELS
  ? process.env.OPENROUTER_FALLBACK_MODELS.split(",").map((s) => s.trim()).filter(Boolean)
  : ["openai/gpt-oss-20b:free", "google/gemma-4-31b-it:free", "openrouter/free"];

/**
 * Resolve the ordered model list for a bot: [primary, ...fallbacks].
 * OpenRouter's `models` array gives us automatic failover when a free model
 * is rate-limited or temporarily unavailable.
 */
export function modelsForBot(bot?: string): string[] {
  const key = bot && bot in BOT_MODELS ? bot : "system";
  const primary = BOT_MODELS[key] ?? BOT_MODELS.system;
  const list = [primary];
  for (const f of FREE_FALLBACKS) if (!list.includes(f)) list.push(f);
  return list;
}

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterChatOptions {
  /** Bot key used to pick the model (luma | ouro | ankaa | system). */
  bot?: string;
  /** Explicit model list (overrides `bot`). First entry is primary. */
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  /** Allow the model to emit reasoning tokens. Default false for speed. */
  reasoning?: boolean;
  /** Max retry attempts on transient failures. Default 3. */
  maxAttempts?: number;
  signal?: AbortSignal;
  /** Optional metadata (kept for call-site clarity; not sent to the API). */
  kind?: string;
  documentId?: string;
  userId?: string;
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pace requests to the account-wide free-tier budget. On a persistent server
 * this smooths bursts up to OpenRouter's per-minute ceiling (waiting briefly
 * for a slot) instead of failing — maximizing sustained free-tier throughput.
 * The daily ceiling can't be waited out, so it throws immediately.
 */
async function acquireGlobalSlot(): Promise<void> {
  const maxWaitMs = Number(process.env.OPENROUTER_MAX_QUEUE_MS) || 12_000;
  const start = Date.now();
  for (;;) {
    const r = checkGlobalAiBudget();
    if (r.allowed) return;
    if (r.scope === "rpd") {
      throw new AiBudgetError(
        "The shared daily AI budget for free models has been reached. Try again later, or add OpenRouter credit / raise OPENROUTER_FREE_RPD to lift the cap.",
        r.retryAfterSec,
      );
    }
    // Per-minute ceiling: wait briefly for the next slot, bounded by maxWaitMs.
    if (Date.now() - start >= maxWaitMs) return; // best-effort; provider 429 + fallback covers rare overflow
    await sleep(Math.min(1_500, Math.max(250, r.retryAfterSec * 1000)));
  }
}

/**
 * Core call: send messages to OpenRouter and return the assistant's text.
 * Includes exponential-backoff retry on transient (network / 429 / 5xx) errors.
 */
export async function openRouterChat(
  messages: OpenRouterMessage[],
  opts: OpenRouterChatOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new LemniscateAIError(
      "Lemniscate's AI companions aren't available yet — the service hasn't been configured. Add an API key to enable Luma, Ouro, and Ankaa.",
      { status: 503, detail: "OPENROUTER_API_KEY is not set" },
    );
  }

  const models = opts.models ?? modelsForBot(opts.bot);
  const body: Record<string, unknown> = {
    model: models[0],
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  // Provide the ordered list so OpenRouter can fail over automatically.
  // OpenRouter caps the `models` array at 3 entries (primary + fallbacks).
  if (models.length > 1) body.models = models.slice(0, 3);
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;
  // Keep responses fast and clean unless reasoning is explicitly requested.
  if (!opts.reasoning) body.reasoning = { enabled: false };

  // Pace against the account-wide free-tier budget before spending a request.
  await acquireGlobalSlot();

  const maxAttempts = opts.maxAttempts ?? 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Optional attribution headers used by OpenRouter's dashboards.
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://lemniscate.app",
          "X-Title": process.env.OPENROUTER_SITE_NAME || "Lemniscate",
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      if (!res.ok) {
        let detail = "";
        try {
          const j = await res.json();
          detail = j?.error?.message || JSON.stringify(j);
        } catch {
          detail = await res.text().catch(() => "");
        }
        // Retry transient statuses; fail fast on client errors (4xx except 429).
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
          lastErr = new LemniscateAIError(AI_BUSY_MESSAGE, { status: 503, detail: `HTTP ${res.status}: ${detail}` });
          // Honor the provider's Retry-After header when present.
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 10_000)
              : 700 * 2 ** (attempt - 1) + Math.random() * 200;
          await sleep(waitMs);
          continue;
        }
        logAiDetail(`HTTP ${res.status}: ${detail}`);
        throw classifyHttpError(res.status, detail, Number(res.headers.get("retry-after")));
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        // Empty completion — retry if attempts remain, else surface an error.
        if (attempt < maxAttempts) {
          lastErr = new LemniscateAIError(AI_BUSY_MESSAGE, { status: 502, detail: "empty completion" });
          await sleep(500 * attempt);
          continue;
        }
        throw new LemniscateAIError(
          "Lemniscate's AI companion didn't return a response. Please try again.",
          { status: 502, detail: "empty completion" },
        );
      }
      return content.trim();
    } catch (err: unknown) {
      lastErr = err;
      // A classified Lemniscate error is final on the last attempt; otherwise,
      // only genuine transient (network) errors are worth retrying.
      const msg = String((err as Error)?.message ?? err).toLowerCase();
      const transient =
        !(err instanceof LemniscateAIError) &&
        (msg.includes("fetch") ||
          msg.includes("network") ||
          msg.includes("timeout") ||
          msg.includes("econnreset") ||
          msg.includes("socket"));
      if (!transient || attempt === maxAttempts) {
        if (err instanceof LemniscateAIError) throw err;
        logAiDetail(String((err as Error)?.message ?? err));
        throw new LemniscateAIError(
          "Lemniscate can't reach its AI service right now. Please try again in a moment.",
          { status: 503, detail: String((err as Error)?.message ?? err) },
        );
      }
      await sleep(700 * 2 ** (attempt - 1) + Math.random() * 200);
    }
  }
  if (lastErr instanceof LemniscateAIError) throw lastErr;
  throw new LemniscateAIError(
    "Lemniscate can't reach its AI service right now. Please try again in a moment.",
    { status: 503, detail: String((lastErr as Error)?.message ?? lastErr) },
  );
}

/** Shared "temporarily busy/unavailable" message for transient failures. */
const AI_BUSY_MESSAGE =
  "Lemniscate's AI companions are busy right now. Please try again in a moment.";

/** Map an HTTP status from the AI provider to a branded, user-safe error. */
function classifyHttpError(status: number, detail: string, retryAfter: number): LemniscateAIError {
  const retryAfterSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;
  if (status === 401 || status === 403) {
    return new LemniscateAIError(
      "Lemniscate couldn't authenticate with its AI service. Please check the configuration.",
      { status: 503, detail: `HTTP ${status}: ${detail}` },
    );
  }
  if (status === 402) {
    return new LemniscateAIError(
      "Lemniscate's AI budget is exhausted. Please try again later.",
      { status: 429, detail: `HTTP ${status}: ${detail}` },
    );
  }
  if (status === 429) {
    return new LemniscateAIError(AI_BUSY_MESSAGE, { status: 429, retryAfterSec, detail: `HTTP 429: ${detail}` });
  }
  if (status >= 500) {
    return new LemniscateAIError(AI_BUSY_MESSAGE, { status: 503, retryAfterSec, detail: `HTTP ${status}: ${detail}` });
  }
  return new LemniscateAIError(
    "Lemniscate couldn't complete that request with its AI service. Please try again or adjust your input.",
    { status: 502, detail: `HTTP ${status}: ${detail}` },
  );
}

/**
 * Translate any error thrown by the AI client into a route-ready shape:
 * a user-safe message, an HTTP status, and an optional Retry-After value.
 * Non-Lemniscate errors collapse to a generic branded message.
 */
export function describeAiError(err: unknown): { status: number; message: string; retryAfterSec?: number } {
  if (err instanceof LemniscateAIError) {
    return { status: err.status, message: err.message, retryAfterSec: err.retryAfterSec };
  }
  return {
    status: 502,
    message: "Lemniscate's AI companions ran into a problem. Please try again.",
  };
}

/**
 * Convenience wrapper: single system + user turn → assistant text.
 */
export function openRouterComplete(
  systemPrompt: string,
  userContent: string,
  opts: OpenRouterChatOptions = {},
): Promise<string> {
  return openRouterChat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    opts,
  );
}

/**
 * Backwards-compatible shim for routes originally written against the
 * z-ai-web-dev-sdk `zai.chat.completions.create({ messages })` shape.
 *
 * Returns an object with the same `{ choices: [{ message: { content } }] }`
 * structure so existing call sites need only swap the client, not their
 * response-parsing logic. Any legacy "assistant" system prompt (a z-ai quirk)
 * is normalized to the "system" role for OpenAI-compatible providers.
 */
export async function chatCompletionCompat(
  params: { messages: Array<{ role: string; content: string }> },
  opts: OpenRouterChatOptions = {},
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  const msgs: OpenRouterMessage[] = params.messages.map((m, i) => {
    // The legacy routes put the system prompt in the first "assistant" message.
    const role =
      m.role === "assistant" && i === 0
        ? "system"
        : (m.role === "system" || m.role === "user" || m.role === "assistant"
            ? m.role
            : "user");
    return { role, content: m.content };
  });
  // Track usage so per-user quotas (checkUserQuota) count these calls too —
  // mirrors the behavior of aiComplete/aiCompleteJson. Fire-and-forget.
  const promptText = msgs.map((m) => m.content).join("\n");
  const started = Date.now();
  try {
    const content = await openRouterChat(msgs, opts);
    void trackUsage({
      bot: opts.bot ?? "system",
      kind: opts.kind ?? "chat",
      documentId: opts.documentId,
      userId: opts.userId,
      tokensEstimate: estimateTokens(promptText, content),
      latencyMs: Date.now() - started,
      status: "ok",
    }).catch(() => {});
    return { choices: [{ message: { content } }] };
  } catch (err) {
    void trackUsage({
      bot: opts.bot ?? "system",
      kind: opts.kind ?? "chat",
      documentId: opts.documentId,
      userId: opts.userId,
      tokensEstimate: estimateTokens(promptText),
      latencyMs: Date.now() - started,
      status: "error",
    }).catch(() => {});
    throw err;
  }
}
