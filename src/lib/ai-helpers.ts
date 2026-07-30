import type { ParsedDoc } from "@/lib/types";

/**
 * Build a representative text excerpt from a parsed document for AI prompts.
 * Takes the first ~1000 chars of each of the first `maxChapters` chapters,
 * prefixed with the chapter title as a markdown heading.
 *
 * @param parsed  The parsed document (chapters + chunks).
 * @param maxChapters  How many leading chapters to sample (default 8).
 * @param perChapter  Max chars per chapter (default 1000).
 * @param totalMax    Hard cap on total excerpt length (default 10000).
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

/**
 * Build an excerpt focused on a single chapter (plus a little surrounding
 * context). Used by chapter-scoped AI features.
 */
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

/**
 * Lazy-load the Z.ai SDK and create a chat completion. Centralizes the dynamic
 * import so route files stay small.
 */
export async function aiComplete(systemPrompt: string, userContent: string): Promise<string> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    thinking: { type: "disabled" },
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * JSON-array completion. Asks the model for a JSON array, strips markdown
 * fences, and parses. Returns the parsed array or throws on failure.
 */
export async function aiCompleteJson<T>(
  systemPrompt: string,
  userContent: string,
): Promise<T[]> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  // Strip markdown code fences if present.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error("AI did not return a JSON array");
  }
  return parsed as T[];
}
