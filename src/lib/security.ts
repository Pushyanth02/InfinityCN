import { NextResponse } from "next/server";

/**
 * Security headers applied to all API responses.
 * Follows OWASP recommended headers for web APIs.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * Apply security headers to a NextResponse.
 */
export function withSecurityHeaders<T>(
  res: NextResponse<T>,
  extra?: Record<string, string>,
): NextResponse<T> {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      res.headers.set(key, value);
    }
  }
  return res;
}

/**
 * Validate that a string is a safe document ID (CUID format).
 * Prevents injection attacks via the documentId parameter.
 */
export function isValidDocumentId(id: string): boolean {
  return typeof id === "string" && /^[a-z0-9]{20,30}$/i.test(id);
}

/**
 * Sanitize AI output text for safe display.
 * Strips potential script tags and event handlers.
 * (The reader renders with whitespace-pre-wrap, not dangerouslySetInnerHTML,
 * so this is defense-in-depth.)
 */
export function sanitizeAIText(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Validate file upload safety.
 */
export function validateUploadedFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 200 * 1024 * 1024; // 200MB
  const ALLOWED_EXTENSIONS = ["pdf", "epub", "docx", "md", "markdown", "txt", "html", "htm"];
  const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "application/epub+zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/markdown",
    "text/plain",
    "text/html",
    "application/octet-stream", // browsers often use this for unknown types
  ];

  if (file.size === 0) return { valid: false, error: "File is empty" };
  if (file.size > MAX_SIZE)
    return { valid: false, error: `File exceeds ${MAX_SIZE / 1024 / 1024}MB limit` };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Unsupported file type: .${ext}` };
  }

  // MIME type check — allow octet-stream as fallback since browsers vary
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    // Don't block — just warn via the extension check above
  }

  // Prevent path traversal in filename
  if (file.name.includes("..") || file.name.includes("/") || file.name.includes("\\")) {
    return { valid: false, error: "Invalid filename" };
  }

  return { valid: true };
}
