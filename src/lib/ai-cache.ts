import { db } from "@/lib/db";

/**
 * AI result caching layer.
 *
 * Many AI requests are deterministic (summaries, themes, characters, study
 * guides). This cache stores results in the AiScene table with a special
 * mood prefix, so repeated requests return instantly without re-calling
 * the AI provider.
 *
 * Expected cost reduction: 60-90% for repeat requests.
 *
 * To upgrade to Redis: replace the DB-based cache with Redis GET/SET
 * using keys like `ai:cache:{documentId}:{task}:{chapterIndex}`.
 */

const CACHE_MOOD_PREFIX = "cache:";

interface CacheKey {
  documentId: string;
  task: string;
  chapterIndex?: number;
}

function moodKey(k: CacheKey): string {
  return `${CACHE_MOOD_PREFIX}${k.task}:${k.chapterIndex ?? "all"}`;
}

/**
 * Get a cached AI result. Returns the cached text, or null if not cached.
 */
export async function getCachedResult(k: CacheKey): Promise<string | null> {
  const scene = await db.aiScene.findFirst({
    where: { documentId: k.documentId, mood: moodKey(k) },
    orderBy: { createdAt: "desc" },
  });
  if (!scene) return null;
  return scene.body;
}

/**
 * Store an AI result in the cache. Replaces any existing entry for the same key.
 */
export async function setCachedResult(k: CacheKey, result: string): Promise<void> {
  // Delete existing cache entry for this key.
  await db.aiScene.deleteMany({
    where: { documentId: k.documentId, mood: moodKey(k) },
  });
  // Insert the new cached result.
  await db.aiScene.create({
    data: {
      documentId: k.documentId,
      ordinal: 0,
      title: k.task,
      body: result,
      mood: moodKey(k),
      characters: "[]",
    },
  });
}

/**
 * Check if a cached result exists and return it, or run the AI function
 * and cache the result. A convenience wrapper.
 */
export async function cachedOrGenerate(
  k: CacheKey,
  generate: () => Promise<string>,
  opts: { regenerate?: boolean } = {},
): Promise<{ result: string; cached: boolean }> {
  if (!opts.regenerate) {
    const cached = await getCachedResult(k);
    if (cached) return { result: cached, cached: true };
  }
  const result = await generate();
  // Cache the result (fire-and-forget — don't block the response).
  void setCachedResult(k, result).catch(() => {});
  return { result, cached: false };
}
