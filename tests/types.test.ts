import { describe, it, expect } from "vitest";
import { sourceTypeFromMime, formatBytes, gradientForId, isRecent } from "@/lib/types";

describe("sourceTypeFromMime", () => {
  it("detects by extension", () => {
    expect(sourceTypeFromMime(null, "a.pdf")).toBe("pdf");
    expect(sourceTypeFromMime(null, "a.epub")).toBe("epub");
    expect(sourceTypeFromMime(null, "a.docx")).toBe("docx");
    expect(sourceTypeFromMime(null, "a.md")).toBe("md");
    expect(sourceTypeFromMime(null, "a.txt")).toBe("txt");
    expect(sourceTypeFromMime(null, "a.html")).toBe("html");
  });

  it("detects by mime when extension is absent", () => {
    expect(sourceTypeFromMime("application/pdf", "noext")).toBe("pdf");
    expect(sourceTypeFromMime("text/plain", "noext")).toBe("txt");
  });

  it("falls back to 'other' for unknown types", () => {
    expect(sourceTypeFromMime("application/zip", "a.zip")).toBe("other");
  });
});

describe("formatBytes", () => {
  it("handles zero / falsy", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(null)).toBe("0 B");
  });

  it("formats across units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("gradientForId", () => {
  it("is deterministic for the same id", () => {
    expect(gradientForId("abc123")).toBe(gradientForId("abc123"));
  });

  it("returns a linear-gradient string", () => {
    expect(gradientForId("xyz")).toMatch(/^linear-gradient/);
  });
});

describe("isRecent", () => {
  it("treats now as recent and old dates as not", () => {
    expect(isRecent(new Date().toISOString())).toBe(true);
    expect(isRecent(new Date(Date.now() - 40 * 86400_000).toISOString())).toBe(false);
  });
});
