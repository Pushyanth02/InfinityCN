import { describe, it, expect } from "vitest";
import { isValidDocumentId, sanitizeAIText, validateUploadedFile } from "@/lib/security";

describe("isValidDocumentId", () => {
  it("accepts CUID-like ids (20-30 alphanumerics)", () => {
    expect(isValidDocumentId("cknx7q2p90000abcd1234efgh")).toBe(true);
    expect(isValidDocumentId("a".repeat(20))).toBe(true);
    expect(isValidDocumentId("a".repeat(30))).toBe(true);
  });

  it("rejects wrong length, empty, or non-alphanumeric ids", () => {
    expect(isValidDocumentId("short")).toBe(false);
    expect(isValidDocumentId("a".repeat(31))).toBe(false);
    expect(isValidDocumentId("")).toBe(false);
    expect(isValidDocumentId("has-dashes-and-symbols-!!")).toBe(false);
  });

  it("rejects injection-style payloads", () => {
    expect(isValidDocumentId("'; DROP TABLE Document;--")).toBe(false);
    expect(isValidDocumentId("../../etc/passwd")).toBe(false);
  });
});

describe("sanitizeAIText", () => {
  it("strips script and iframe tags and inline event handlers", () => {
    const dirty = `Hello <script>alert(1)</script><iframe src="x"></iframe> <b onclick="evil()">world</b>`;
    const clean = sanitizeAIText(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("<iframe");
    expect(clean.toLowerCase()).not.toContain("onclick=");
  });

  it("strips javascript: URIs", () => {
    expect(sanitizeAIText("javascript:alert(1)")).not.toContain("javascript:");
  });

  it("leaves ordinary prose untouched", () => {
    const text = "A calm sentence about the moon.";
    expect(sanitizeAIText(text)).toBe(text);
  });
});

describe("validateUploadedFile", () => {
  const makeFile = (name: string, size: number, type = "") => {
    // Minimal File-like object; validateUploadedFile only reads name/size/type.
    return { name, size, type } as unknown as File;
  };

  it("accepts a normal supported file", () => {
    expect(validateUploadedFile(makeFile("book.pdf", 1024, "application/pdf")).valid).toBe(true);
  });

  it("rejects empty files", () => {
    expect(validateUploadedFile(makeFile("book.pdf", 0)).valid).toBe(false);
  });

  it("rejects files over the size cap", () => {
    expect(validateUploadedFile(makeFile("book.pdf", 300 * 1024 * 1024)).valid).toBe(false);
  });

  it("rejects unsupported extensions", () => {
    expect(validateUploadedFile(makeFile("malware.exe", 1024)).valid).toBe(false);
  });

  it("rejects path-traversal filenames", () => {
    expect(validateUploadedFile(makeFile("../evil.pdf", 1024)).valid).toBe(false);
    expect(validateUploadedFile(makeFile("a/b.pdf", 1024)).valid).toBe(false);
  });
});
