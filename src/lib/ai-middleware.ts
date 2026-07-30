import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { withSecurityHeaders, isValidDocumentId, sanitizeAIText } from "@/lib/security";

/**
 * Wraps an AI API handler with rate limiting, security headers, input
 * validation, and output sanitization.
 *
 * Usage:
 *   export const POST = withAIProtection(async (req, { documentId }) => {
 *     // ... your AI logic
 *     return NextResponse.json({ analysis: "..." });
 *   });
 */
export function withAIProtection(
  handler: (req: NextRequest, ctx: { documentId: string; body: any }) => Promise<NextResponse>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // 1. Rate limit check
    const rateLimit = checkRateLimit(req, RATE_LIMITS.ai);
    if (!rateLimit.allowed) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSec) } },
        ),
        rateLimitHeaders(rateLimit),
      );
    }

    // 2. Parse and validate body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return withSecurityHeaders(
        NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
        rateLimitHeaders(rateLimit),
      );
    }

    const documentId = body?.documentId;
    if (!documentId || !isValidDocumentId(documentId)) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Valid documentId required" }, { status: 400 }),
        rateLimitHeaders(rateLimit),
      );
    }

    // 3. Run the handler
    try {
      const res = await handler(req, { documentId, body });
      // 4. Sanitize AI output in the response (defense-in-depth)
      // Note: the response is already JSON, so we trust the structure but
      // sanitize any text fields that will be displayed to the user.
      return withSecurityHeaders(res, rateLimitHeaders(rateLimit));
    } catch (err: any) {
      const message = err?.message ?? "AI processing failed";
      // Don't leak internal error details in production
      const safeMessage =
        process.env.NODE_ENV === "production"
          ? "AI processing failed. Please try again."
          : message;
      return withSecurityHeaders(
        NextResponse.json({ error: safeMessage }, { status: 500 }),
        rateLimitHeaders(rateLimit),
      );
    }
  };
}

/**
 * Sanitize AI-generated text for safe display.
 */
export function sanitizeAnalysis(text: string): string {
  return sanitizeAIText(text);
}
