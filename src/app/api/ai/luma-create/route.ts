import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { aiComplete } from "@/lib/ai-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Luma co-writer — continues a user's draft in the Create view. */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, RATE_LIMITS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { draft, prompt } = await req.json();
  if (typeof draft !== "string" || typeof prompt !== "string")
    return NextResponse.json({ error: "draft and prompt required" }, { status: 400 });

  const system = `You are Luma, a warm, imaginative co-writer helping a reader craft their own story. Read their draft and the request, then write the next 150-300 words. Match their voice and tone. Continue the narrative naturally — don't restart or summarize. Write only the new prose, no preamble, no headings (unless the draft uses them). Use *italics* for emphasis where fitting.`;

  const user = `My draft so far:\n\n${draft.slice(-6000)}\n\n---\n\nMy request: ${prompt}`;
  const continuation = await aiComplete(system, user);

  return NextResponse.json({ continuation });
}
