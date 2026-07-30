import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Anonymous session authentication.
 *
 * Every visitor gets a stable, signed userId via an HTTP-only cookie. This
 * provides real user isolation without requiring sign-in — each user can
 * only access their own documents, and AI quotas are enforced per-user.
 *
 * The cookie is signed with HMAC-SHA256 using a secret derived from
 * DATABASE_URL (or a dedicated LEMNISCATE_AUTH_SECRET env var if set).
 *
 * To upgrade to full auth later, replace getUserId() to read from
 * next-auth's auth() session instead of the cookie.
 *
 * NOTE: This module is Edge-compatible (no next/headers import) so it can
 * be used in middleware.ts.
 */

const COOKIE_NAME = "lem.session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Derive the signing secret from the environment. */
function getSecret(): string {
  return (
    process.env.LEMNISCATE_AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "lemniscate-dev-secret-change-in-production"
  );
}

/** Sign a userId with HMAC-SHA256. */
function sign(userId: string): string {
  return createHmac("sha256", getSecret()).update(userId).digest("hex");
}

/** Verify a signed userId. Returns the userId if valid, null otherwise. */
function verify(userId: string, signature: string): string | null {
  const expected = sign(userId);
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (timingSafeEqual(a, b)) return userId;
    return null;
  } catch {
    return null;
  }
}

/** Generate a new random userId. */
function generateUserId(): string {
  return `u_${randomBytes(12).toString("hex")}`;
}

/**
 * Get the current user's ID from the request cookie.
 * Returns null if no valid session exists.
 * Only works with a NextRequest — Edge-compatible.
 */
export function getUserId(req: NextRequest): string | null {
  const cookieValue = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;

  // Format: <userId>.<signature>
  const dot = cookieValue.lastIndexOf(".");
  if (dot < 0) return null;
  const userId = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  return verify(userId, signature);
}

/**
 * Ensure a user has a session. If no valid session exists, creates one
 * and sets the cookie on the response. Returns the userId.
 *
 * Usage in API routes:
 *   const { userId, headers } = ensureSession(req);
 *   // use userId for queries
 *   // spread headers into your NextResponse: new NextResponse(..., { headers })
 */
export function ensureSession(req: NextRequest): {
  userId: string;
  setCookie: Record<string, string>;
} {
  const existing = getUserId(req);
  if (existing) {
    return { userId: existing, setCookie: {} };
  }
  // Create a new session.
  const userId = generateUserId();
  const value = `${userId}.${sign(userId)}`;
  const cookie = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { userId, setCookie: { "Set-Cookie": cookie } };
}

/**
 * Middleware-compatible: get or create a userId from the request,
 * returning the cookie header to set if new.
 */
export function middlewareSession(req: NextRequest): {
  userId: string;
  cookie?: string;
} {
  const existing = getUserId(req);
  if (existing) return { userId: existing };

  const userId = generateUserId();
  const value = `${userId}.${sign(userId)}`;
  const cookie = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { userId, cookie };
}
