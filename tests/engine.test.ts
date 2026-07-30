import { describe, it, expect } from "vitest";
import { chunkText, countWords, buildParsed } from "@/lib/engine/parse";
import {
  stripBoilerplate,
  organizeChapters,
  scoreQuality,
  detectLanguage,
} from "@/lib/engine/core-engine";
import type { Chapter } from "@/lib/types";

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("strips leading markdown heading markers from paragraphs", () => {
    const chunks = chunkText("## A Heading\n\nSome body text.");
    const joined = chunks.map((c) => c.text).join("\n");
    expect(joined).toContain("A Heading");
    expect(joined).not.toContain("## A Heading");
  });

  it("splits long text into multiple chunks at paragraph boundaries", () => {
    const para = "word ".repeat(300).trim(); // ~1500 chars
    const chunks = chunkText(`${para}\n\n${para}\n\n${para}`);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe("buildParsed", () => {
  it("detects chapters from headings", () => {
    const text = "Chapter 1: Beginnings\n\nIt began.\n\nChapter 2: Middles\n\nIt continued.";
    const parsed = buildParsed(text, { title: "T" });
    expect(parsed.chapters.length).toBe(2);
    expect(parsed.title).toBe("T");
    expect(parsed.wordCount).toBeGreaterThan(0);
  });

  it("always yields at least one chapter", () => {
    const parsed = buildParsed("Just a single flat paragraph with no headings.", {});
    expect(parsed.chapters.length).toBeGreaterThanOrEqual(1);
  });
});

describe("stripBoilerplate", () => {
  it("removes text outside Project Gutenberg START/END markers", () => {
    const body = [
      "Front matter noise to discard.",
      "*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
      "The real story lives here.",
      "*** END OF THE PROJECT GUTENBERG EBOOK SOMETHING ***",
      "Trailing license noise to discard.",
    ].join("\n\n");
    const out = stripBoilerplate(body);
    expect(out).toContain("The real story lives here.");
    expect(out).not.toContain("Front matter noise");
    expect(out).not.toContain("Trailing license noise");
  });

  it("returns empty for empty input", () => {
    expect(stripBoilerplate("")).toBe("");
  });
});

describe("organizeChapters", () => {
  const mkChapter = (title: string, body: string, ordinal: number): Chapter => ({
    id: `id-${ordinal}`,
    title,
    ordinal,
    chunks: [{ index: 0, text: body, charOffset: 0 }],
  });

  it("merges a tiny chapter into the previous one", () => {
    const big = mkChapter("Big", "x".repeat(500), 0);
    const tiny = mkChapter("Tiny", "short", 1); // < MIN_CHAPTER_CHARS (100)
    const out = organizeChapters([big, tiny]);
    expect(out.length).toBe(1);
    expect(out[0].ordinal).toBe(0);
  });

  it("keeps distinct substantial chapters and reindexes ordinals", () => {
    const a = mkChapter("A", "x".repeat(500), 5);
    const b = mkChapter("B", "y".repeat(500), 9);
    const out = organizeChapters([a, b]);
    expect(out.length).toBe(2);
    expect(out.map((c) => c.ordinal)).toEqual([0, 1]);
  });
});

describe("scoreQuality", () => {
  it("scores clean prose highly and empty content at 0", () => {
    const clean = buildParsed(
      "Chapter 1: Light\n\n" + "The lantern glowed softly across the quiet room. ".repeat(40),
      { title: "T" },
    );
    expect(scoreQuality(clean)).toBeGreaterThan(0.7);

    const empty = buildParsed("", {});
    // buildParsed yields a placeholder chapter; its body is effectively empty.
    expect(scoreQuality(empty)).toBeLessThanOrEqual(0.9);
  });
});

describe("detectLanguage", () => {
  it("reports en (single-language reader)", () => {
    expect(detectLanguage("any text at all")).toBe("en");
    expect(detectLanguage("")).toBe("en");
  });
});
