/**
 * Safe error response utilities.
 *
 * In production, never expose internal error details (stack traces, DB DSNs,
 * Prisma error messages) to the client. Always return a generic message.
 * In development, include the actual error for debugging.
 */

export function safeErrorMessage(err: unknown, fallback = "An error occurred"): string {
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function safeErrorDetail(err: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
