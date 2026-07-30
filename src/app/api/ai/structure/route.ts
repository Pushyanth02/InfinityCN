import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { chatCompletionCompat } from "@/lib/ai-client";
import { ensureSession } from "@/lib/auth";
import { checkUserQuota } from "@/lib/quota";
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
 * The single OCR-refinement system prompt, shared by the HTTP route and the
 * server-side direct call so the two can never drift apart.
 */
const OCR_SYSTEM_PROMPT = `You are an OCR correction specialist for literary texts. Your task is to clean OCR errors and improve formatting while preserving the original content with high fidelity.

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

Return ONLY the cleaned text. No JSON, no markdown fences, no commentary. Just the refined text with OCR errors corrected and formatting normalized.`;

/**
 * POST /api/ai/structure
 *
 * AI-driven OCR refinement for literary text. Given a chapter's raw text
 * (which may come from scanned books with OCR noise), the AI corrects OCR
 * mistakes only when confident, preserves wording/formatting/foreign scripts,
 * and normalizes spacing/punctuation/artifacts. It does NOT analyze, rewrite,
 * summarize, or translate.
 *
 * The AI returns the refined text (same structure, cleaned OCR). The caller
 * caches the result so the chapter is never reprocessed.
 */
export async function POST(req: NextRequest) {
  const { userId, setCookie } = ensureSession(req);

  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...setCookie } },
    );
  }

  // Per-user quota — this endpoint calls the AI provider directly.
  const quota = await checkUserQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: `Daily AI limit reached (${quota.dailyUsed}/${quota.dailyLimit}). Try again later.` },
      { status: 429, headers: { "Retry-After": String(quota.retryAfterSec), ...setCookie } },
    );
  }

  const { text, chapterTitle }: OCRRefineRequest = await req.json();

  const result = await refineOCRDirect(text, chapterTitle, { userId });
  return NextResponse.json(result satisfies OCRRefineResult, { headers: setCookie });
}

/**
 * Shared OCR refinement. Used by the HTTP route above and directly by the
 * Core Engine / per-chapter refine endpoint (avoiding an HTTP round-trip).
 *
 * `opts.userId` / `opts.documentId` attribute the AI usage to a user so it
 * counts toward their quota; they're omitted when called from the ingest
 * pipeline (which has no user context).
 */
export async function refineOCRDirect(
  text: string,
  chapterTitle?: string,
  opts: { userId?: string; documentId?: string } = {},
): Promise<OCRRefineResult> {
  if (!text || text.trim().length < 10) {
    return { refinedText: text ?? "", title: chapterTitle ?? undefined };
  }

  // Cap the input to avoid token overflow — process one chapter at a time.
  const excerpt = text.slice(0, 8000);
  const completion = await chatCompletionCompat({
    messages: [
      { role: "assistant", content: OCR_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${chapterTitle ? `Chapter title: ${chapterTitle}\n\n` : ""}${excerpt}`,
      },
    ],
  }, { bot: "system", kind: "ocr_refine", userId: opts.userId, documentId: opts.documentId });

  const refinedText = completion.choices[0]?.message?.content?.trim() ?? excerpt;

  // Safety: if the AI returned something much shorter, keep the original
  // (the refinement should never lose content).
  if (refinedText.length < excerpt.length * 0.5) {
    return { refinedText: excerpt, title: chapterTitle ?? undefined };
  }

  return { refinedText, title: chapterTitle ?? undefined };
}
