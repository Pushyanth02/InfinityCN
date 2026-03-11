/**
 * constants.ts — Shared application-wide constants
 *
 * Centralises configuration values used across multiple modules to eliminate
 * magic numbers and make tuning easier.  Import the specific constants you
 * need rather than importing the whole module.
 */

// ─── Text Processing ──────────────────────────────────────────────────────────

/** Maximum characters per chunk fed to the LLM — keeps requests within token limits. */
export const MAX_CHUNK_CHARS = 3500;

// ─── AI Response Cache ────────────────────────────────────────────────────────

/** How long a cached AI response remains valid (30 minutes). */
export const AI_CACHE_TTL_MS = 30 * 60 * 1000;

/** Maximum number of entries held in the in-memory LRU response cache. */
export const AI_MAX_CACHE_SIZE = 50;

// ─── Retry / Backoff ──────────────────────────────────────────────────────────

/** Upper bound on exponential-backoff delay to prevent unbounded waits. */
export const AI_MAX_RETRY_DELAY_MS = 30_000;

// ─── Network Timeouts ─────────────────────────────────────────────────────────

/** Fetch timeout for JSON-mode AI calls (metadata extraction, etc.). */
export const AI_JSON_TIMEOUT_MS = 30_000;

/** Fetch timeout for raw-text / cinematification AI calls (longer output). */
export const AI_RAWTEXT_TIMEOUT_MS = 60_000;
