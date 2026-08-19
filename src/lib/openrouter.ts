/**
 * Direct browser → OpenRouter client.
 *
 * The browser calls OpenRouter directly. The API key lives ONLY in memory
 * (module-level variable) — never in localStorage, IndexedDB, prefs, URLs
 * or error messages. A page refresh clears it; the user must re-enter it.
 *
 * All requests:
 *   - target `https://openrouter.ai/api/v1/...` directly (no proxy)
 *   - send `Authorization: Bearer <key>`, `HTTP-Referer: https://lemniscate.local`
 *     and `X-Title: Lemniscate`
 *   - use `AbortController` for timeouts (45s chat, 15s key/models)
 *   - sanitise upstream error payloads so the key (which OpenRouter
 *     sometimes echoes in rejection bodies) is never surfaced to the user
 *
 * Nothing here ever logs the key or includes it in thrown errors.
 */
import type { AiModelInfo } from "./types";

const API = "https://openrouter.ai/api/v1";

const KEY_TIMEOUT_MS = 15_000;
const MODELS_TIMEOUT_MS = 15_000;
const CHAT_TIMEOUT_MS = 45_000;

/* ────────────────────────────────────────────────────────────
   Key management — session-only (in-memory, not localStorage).
   ──────────────────────────────────────────────────────────── */

let sessionKey: string | null = null;

/** Set the session key. Stored only in module-level memory — survives
 *  route changes within the same tab, but is wiped on reload. */
export function setSessionKey(key: string): void {
  sessionKey = key.trim();
}

/** Forget the session key. */
export function clearSessionKey(): void {
  sessionKey = null;
}

/** True when a key that could plausibly work is set. */
export function hasKey(): boolean {
  return !!sessionKey && sessionKey.length > 10;
}

/** Returns `sk-or-v1•••••••••` format — never the full key. Empty string
 *  when no key is set. For very short keys we mask the whole thing. */
export function getKeyMasked(): string {
  if (!sessionKey) return "";
  const k = sessionKey;
  if (k.length <= 12) return "•".repeat(k.length);
  return k.slice(0, 6) + "•".repeat(k.length - 10) + k.slice(-4);
}

/* ────────────────────────────────────────────────────────────
   Internal helpers.
   ──────────────────────────────────────────────────────────── */

function requireKey(): string {
  if (!sessionKey) throw new Error("No OpenRouter key set — add one in Settings.");
  return sessionKey;
}

function authHeaders(key: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://lemniscate.local",
    "X-Title": "Lemniscate",
  };
}

function headers(): Record<string, string> {
  return authHeaders(requireKey());
}

/** Read the JSON body of a non-OK response without ever throwing —
 *  used so we can sanitise the upstream message before showing it. */
async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Replace raw upstream payloads with a short, user-safe message. The
 *  OpenRouter error body occasionally echoes parts of the request
 *  (including the masked Authorization header), so we never return the
 *  raw payload — only a trimmed `error.message` if one is present. */
function sanitiseUpstream(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: { message?: unknown } }).error;
    if (err && typeof err.message === "string") {
      const msg = err.message.slice(0, 240);
      // Strip any accidental key echo just in case the upstream returned it.
      const safe = msg.replace(/sk-or-[A-Za-z0-9-_]+/gi, "sk-or-••••");
      if (safe) return safe;
    }
  }
  if (status === 401) return "OpenRouter rejected the key.";
  if (status === 403) return "OpenRouter refused the request.";
  if (status === 404) return "Model not found on OpenRouter.";
  if (status === 429) return "OpenRouter rate limit hit.";
  if (status >= 500) return "OpenRouter is unavailable right now.";
  return `OpenRouter error (${status}).`;
}

/* ────────────────────────────────────────────────────────────
   Key validation — GET /api/v1/key
   The key is passed in (not read from session state) so the user can
   validate a key before committing it. Returns ok=false with a
   sanitised message on any failure.
   ──────────────────────────────────────────────────────────── */

export async function validateKey(key: string): Promise<{ ok: boolean; message: string }> {
  const k = key.trim();
  if (!k || k.length < 10) {
    return { ok: false, message: "Key looks too short — OpenRouter keys start with sk-or-…" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), KEY_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/key`, {
      method: "GET",
      signal: ctrl.signal,
      headers: authHeaders(k),
    });
    if (!res.ok) {
      return { ok: false, message: sanitiseUpstream(await safeJson(res), res.status) };
    }
    return { ok: true, message: "Key works — OpenRouter is reachable." };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, message: "OpenRouter took too long to answer." };
    }
    return { ok: false, message: "Couldn't reach OpenRouter." };
  } finally {
    clearTimeout(timer);
  }
}

/** Validate the currently-active session key (the one set via
 *  `setSessionKey()`). Used by `testConnection()` in ./ai so the
 *  Settings "Test connection" button can probe the live session key
 *  without ever exposing the raw key to other modules. */
export async function validateSessionKey(): Promise<{ ok: boolean; message: string }> {
  if (!sessionKey) {
    return { ok: false, message: "No OpenRouter key set — paste your key in Settings to connect." };
  }
  return validateKey(sessionKey);
}

/* ────────────────────────────────────────────────────────────
   Model catalog — GET /api/v1/models
   Returns ONLY free variants (id ends with ":free"). Requires a key
   to be set, mirroring the chat endpoint's auth.
   ──────────────────────────────────────────────────────────── */

export interface RawCatalogModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

export async function fetchFreeModels(_force = false): Promise<AiModelInfo[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODELS_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/models`, {
      method: "GET",
      signal: ctrl.signal,
      headers: headers(),
    });
    if (!res.ok) {
      throw new Error(sanitiseUpstream(await safeJson(res), res.status));
    }
    const json = (await res.json()) as { data?: RawCatalogModel[] };
    const all = Array.isArray(json.data) ? json.data : [];
    return all
      .filter((m) => m && typeof m.id === "string" && m.id.endsWith(":free"))
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        context: m.context_length ?? 0,
        inPerM: Number(m.pricing?.prompt ?? 0) * 1e6,
        outPerM: Number(m.pricing?.completion ?? 0) * 1e6,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("OpenRouter took too long to list models.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ────────────────────────────────────────────────────────────
   Chat — POST /api/v1/chat/completions
   ──────────────────────────────────────────────────────────── */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Parse a single SSE buffer chunk into [events, leftover]. Pure —
 *  unit-testable. Exposed via re-export in `./ai` for the existing
 *  parseSse tests. */
function parseSseChunk(buf: string): { events: string[]; rest: string } {
  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  const events: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("data:")) events.push(t.slice(5).trim());
  }
  return { events, rest };
}

/** Streaming chat completion (SSE). `onDelta` fires as tokens arrive.
 *  No timeout on the SSE connection — the caller may pass an AbortSignal
 *  (typically from a "Stop" button) to cancel mid-stream. */
export async function streamChat(
  messages: ChatMessage[],
  model: string,
  onDelta: (chunk: string) => void,
  signal: AbortSignal | undefined,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<{ text: string; tokens: number | null }> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    signal,
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(sanitiseUpstream(await safeJson(res), res.status));
  }
  if (!res.body) throw new Error("Provider returned no stream body");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let tokens: number | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buf);
    buf = rest;
    for (const payload of events) {
      if (payload === "[DONE]") continue;
      try {
        const j = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { total_tokens?: number };
          error?: { message?: string };
        };
        if (j.error?.message) {
          // Strip any accidental key echo from upstream error messages.
          throw new Error(j.error.message.replace(/sk-or-[A-Za-z0-9-_]+/gi, "sk-or-••••"));
        }
        const delta = j.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onDelta(delta);
        }
        if (j.usage?.total_tokens) tokens = j.usage.total_tokens;
      } catch (e) {
        if (e instanceof Error && !e.message.includes("JSON")) throw e;
        // tolerate one malformed frame — SSE chunks sometimes split a JSON object
      }
    }
  }
  if (!text.trim()) throw new Error("empty_completion");
  return { text, tokens };
}

/** Non-streaming chat completion. Bounded by `timeoutMs` (default 45s)
 *  via AbortController. */
export async function chat(
  messages: ChatMessage[],
  model: string,
  timeoutMs: number = CHAT_TIMEOUT_MS,
  maxTokens?: number
): Promise<{ text: string; tokens: number | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      temperature: 0.55,
    };
    if (maxTokens) body.max_tokens = maxTokens;
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(sanitiseUpstream(await safeJson(res), res.status));
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty_completion");
    return { text: content, tokens: json.usage?.total_tokens ?? null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The model took too long to respond.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
