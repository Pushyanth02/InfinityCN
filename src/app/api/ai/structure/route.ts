import { isValidDocumentId } from "@/lib/security";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OCRRefineRequest {
  text: string;
  chapterTitle?: string;
}

interface OCRRefineResult {
  title?: string;
  refinedText: string;
}

/**
 * POST /api/ai/structure
 *
 * AI-driven OCR refinement for literary text. Given a chapter's raw text
 * (which may come from scanned books with OCR noise), the AI:
 *
 *   1. Corrects OCR mistakes ONLY when highly confident
 *   2. Preserves: original wording, italics, emphasis, quotations,
 *      foreign-language words/scripts (Hebrew, Greek, Latin, etc.),
 *      dictionary entries, verse formatting, translation lists,
 *      chapter headings
 *   3. Normalizes: broken spacing, incorrect punctuation, OCR artifacts,
 *      inconsistent dash usage, misread ligatures (Œ, æ, ﬁ, ﬂ, etc.)
 *   4. Keeps chapter titles exactly structured
 *
 * This performs ONLY OCR cleanup and formatting. It does NOT perform:
 *   - Dialogue analysis
 *   - Character analysis
 *   - Story summarization
 *   - Semantic interpretation
 *   - Literary criticism
 *   - Theme extraction
 *   - Content rewriting
 *
 * The AI returns the refined text (same structure, cleaned OCR). The caller
 * caches the result so the chapter is never reprocessed.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const { text, chapterTitle }: OCRRefineRequest = await req.json();

  if (!text || text.trim().length < 10) {
    return NextResponse.json({
      refinedText: text ?? "",
      title: chapterTitle ?? undefined,
    } satisfies OCRRefineResult);
  }

  // Cap the input to avoid token overflow — process one chapter at a time
  const excerpt = text.slice(0, 8000);

  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `You are an OCR correction specialist for literary texts. Your task is to clean OCR errors and improve formatting while preserving the original content with high fidelity.

CORRECT (only when highly confident):
- OCR character misrecognition (e.g., "rn" → "m", "0" → "O", "1" → "l" or "I")
- Misread ligatures: ﬁ→fi, ﬂ→fl, Œ→OE, æ→ae when appropriate
- Broken spacing (missing spaces between words, or extra spaces within words)
- Incorrect punctuation (e.g., , instead of . at sentence end)
- OCR artifacts (stray characters, encoding noise like ï¿½)
- Inconsistent dash usage (normalize -- to — for em-dashes, - to – for en-dashes where contextually appropriate)

PRESERVE EXACTLY:
- Original wording — do not rewrite or paraphrase
- Line breaks where they convey structure (verse, dictionary entries, lists)
- Italics and emphasis (preserve _underscore_ or *asterisk* markup)
- Quotations and their formatting
- Foreign-language words and scripts (Hebrew חו, Greek κῆτος, Latin, etc.)
- Dictionary entries and their structure
- Verse formatting and line breaks
- Lists of translations (keep aligned)
- Chapter headings exactly as structured (e.g., "CHAPTER II." or "(Right Whale)")
- Footnotes and their markers

DO NOT:
- Perform dialogue analysis or extract speakers
- Analyze narrative structure, themes, or literary devices
- Summarize or abbreviate content
- Rewrite or "improve" the prose
- Translate foreign text
- Add commentary or notes
- Change chapter titles

Return ONLY the cleaned text. No JSON, no markdown fences, no commentary. Just the refined text with OCR errors corrected and formatting normalized.`,
      },
      {
        role: "user",
        content: `${chapterTitle ? `Chapter title: ${chapterTitle}\n\n` : ""}${excerpt}`,
      },
    ],
    thinking: { type: "disabled" },
  });

  const refinedText = completion.choices[0]?.message?.content?.trim() ?? excerpt;

  // If the AI returned something much shorter or empty, keep the original
  // (safety check — the refinement should never lose content)
  if (refinedText.length < excerpt.length * 0.5) {
    return NextResponse.json({
      refinedText: excerpt,
      title: chapterTitle ?? undefined,
    } satisfies OCRRefineResult);
  }

  return NextResponse.json({
    refinedText,
    title: chapterTitle ?? undefined,
  } satisfies OCRRefineResult);
}

/**
 * Server-side direct call (avoids HTTP round-trip when called from the Core
 * Engine or the per-chapter refine endpoint).
 */
export async function refineOCRDirect(
  text: string,
  chapterTitle?: string,
): Promise<OCRRefineResult> {
  if (!text || text.trim().length < 10) {
    return { refinedText: text ?? "", title: chapterTitle ?? undefined };
  }

  const excerpt = text.slice(0, 8000);
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();

  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content: `You are an OCR correction specialist for literary texts. Your task is to clean OCR errors and improve formatting while preserving the original content with high fidelity.

CORRECT (only when highly confident):
- OCR character misrecognition (e.g., "rn" → "m", "0" → "O", "1" → "l" or "I")
- Misread ligatures: ﬁ→fi, ﬂ→fl, Œ→OE, æ→ae when appropriate
- Broken spacing (missing spaces between words, or extra spaces within words)
- Incorrect punctuation (e.g., , instead of . at sentence end)
- OCR artifacts (stray characters, encoding noise like ï¿½)
- Inconsistent dash usage (normalize -- to — for em-dashes, - to – for en-dashes where contextually appropriate)

PRESERVE EXACTLY:
- Original wording — do not rewrite or paraphrase
- Line breaks where they convey structure (verse, dictionary entries, lists)
- Italics and emphasis (preserve _underscore_ or *asterisk* markup)
- Quotations and their formatting
- Foreign-language words and scripts (Hebrew חו, Greek κῆτος, Latin, etc.)
- Dictionary entries and their structure
- Verse formatting and line breaks
- Lists of translations (keep aligned)
- Chapter headings exactly as structured (e.g., "CHAPTER II." or "(Right Whale)")
- Footnotes and their markers

DO NOT:
- Perform dialogue analysis or extract speakers
- Analyze narrative structure, themes, or literary devices
- Summarize or abbreviate content
- Rewrite or "improve" the prose
- Translate foreign text
- Add commentary or notes
- Change chapter titles

Return ONLY the cleaned text. No JSON, no markdown fences, no commentary. Just the refined text with OCR errors corrected and formatting normalized.`,
      },
      {
        role: "user",
        content: `${chapterTitle ? `Chapter title: ${chapterTitle}\n\n` : ""}${excerpt}`,
      },
    ],
    thinking: { type: "disabled" },
  });

  const refinedText = completion.choices[0]?.message?.content?.trim() ?? excerpt;

  // Safety: if the AI returned something much shorter, keep the original
  if (refinedText.length < excerpt.length * 0.5) {
    return { refinedText: excerpt, title: chapterTitle ?? undefined };
  }

  return { refinedText, title: chapterTitle ?? undefined };
}
