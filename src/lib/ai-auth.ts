import { NextRequest, NextResponse } from "next/server";
import { ensureSession } from "@/lib/auth";
import { checkUserQuota, verifyDocumentOwnership } from "@/lib/quota";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Centralized AI route protection.
 *
 * Wraps an AI handler with:
 *   1. Anonymous session auth (userId from signed cookie)
 *   2. Per-user daily/monthly quota check
 *   3. Document ownership verification (if documentId is provided)
 *   4. IP rate limiting
 *
 * Usage:
 *   export const POST = withAIAuth(async (req, ctx) => {
 *     // ctx.userId is guaranteed
 *     // ctx.doc is the verified-owned document (if documentId was in the body)
 *     return NextResponse.json({ ... });
 *   }, { rateLimit: RATE_LIMITS.luma });
 */

interface AIAuthContext {
  userId: string;
  doc: Awaited<ReturnType<typeof verifyDocumentOwnership>> | null;
  setCookie: Record<string, string>;
}

interface WithAIAuthOptions {
  rateLimit?: { windowMs: number; max: number; prefix: string };
  requireDocument?: boolean;
}

export function withAIAuth(
  handler: (req: NextRequest, ctx: AIAuthContext) => Promise<NextResponse>,
  opts: WithAIAuthOptions = {},
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // 1. Auth — get or create the user session.
    const { userId, setCookie } = ensureSession(req);

    // 2. Rate limit (per IP).
    const rl = checkRateLimit(req, opts.rateLimit ?? RATE_LIMITS.ai);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSec),
            ...setCookie,
          },
        },
      );
    }

    // 3. Per-user quota check.
    const quota = await checkUserQuota(userId);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Daily limit reached (${quota.dailyUsed}/${quota.dailyLimit}). Try again in ${Math.ceil(quota.retryAfterSec / 60)} minutes.`,
          quota: { dailyUsed: quota.dailyUsed, dailyLimit: quota.dailyLimit, monthlyUsed: quota.monthlyUsed, monthlyLimit: quota.monthlyLimit },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(quota.retryAfterSec),
            ...setCookie,
          },
        },
      );
    }

    // 4. Document ownership verification (if the body contains a documentId).
    let doc: AIAuthContext["doc"] = null;
    let parsedBody: any = null;
    try {
      parsedBody = await req.json();
    } catch {
      parsedBody = {};
    }
    // Reconstruct the request with the already-parsed body so the handler
    // can call req.json() again without failing.
    const reqClone = new NextRequest(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(parsedBody),
    });

    const documentId = parsedBody?.documentId;
    if (documentId && typeof documentId === "string") {
      doc = await verifyDocumentOwnership(documentId, userId);
      if (!doc) {
        return NextResponse.json(
          { error: "Not found" },
          { status: 404, headers: setCookie },
        );
      }
    } else if (opts.requireDocument) {
      return NextResponse.json(
        { error: "Valid documentId required" },
        { status: 400, headers: setCookie },
      );
    }

    // 5. Run the handler with the verified context.
    try {
      const res = await handler(reqClone, { userId, doc, setCookie });
      // Merge session cookie into the response headers.
      if (Object.keys(setCookie).length > 0) {
        for (const [k, v] of Object.entries(setCookie)) {
          res.headers.set(k, v);
        }
      }
      return res;
    } catch (err) {
      return NextResponse.json(
        { error: "An error occurred" },
        { status: 500, headers: setCookie },
      );
    }
  };
}
