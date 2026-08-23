/**
 * Unit tests for the Lemniscate ingestion engine (pure functions only —
 * no DOM, no network, no binary adapters).
 */
import { describe, it, expect } from "vitest";
import {
  detectFormat,
  validateFile,
  IngestError,
  cleanInline,
  joinLines,
  stripGutenberg,
  isHeading,
  buildChapters,
  fallbackSplit,
  toChapters,
  metaFromFilename,
  titleCase,
  detectLanguage,
  scoreQuality,
  dedupeRunningHeads,
  chapterAtChunk,
  globalChunkCount,
  verifyParsed,
  extOf,
} from "./engine";
import type { RawLine } from "./engine";

const mkFile = (name: string, size: number): File =>
  ({ name, size }) as unknown as File;

describe("extOf", () => {
  it("extracts lowercase extensions", () => {
    expect(extOf("Book.PDF")).toBe("pdf");
    expect(extOf("no-ext")).toBe("");
  });
});

describe("detectFormat", () => {
  it("detects PDF by magic bytes regardless of extension", () => {
    const head = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(detectFormat("weird.bin", "", head)).toBe("pdf");
  });
  it("detects zip containers by extension", () => {
    const pk = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    expect(detectFormat("a.epub", "", pk)).toBe("epub");
    expect(detectFormat("a.docx", "", pk)).toBe("docx");
    expect(detectFormat("a.pptx", "", pk)).toBe("pptx");
    expect(detectFormat("a.zip", "", pk)).toBeNull();
  });
  it("falls back to extension then MIME", () => {
    expect(detectFormat("a.md", "", new Uint8Array(4))).toBe("markdown");
    expect(detectFormat("a", "text/plain", new Uint8Array(4))).toBe("txt");
    // MIME is ignored when an extension is present
    expect(detectFormat("a.txt", "application/pdf", new Uint8Array(4))).toBe(
      "txt",
    );
  });
});

describe("validateFile", () => {
  it("accepts supported extensions and normalizes aliases", () => {
    expect(validateFile(mkFile("a.htm", 10), 50)).toBe("html");
    expect(validateFile(mkFile("a.text", 10), 50)).toBe("txt");
    expect(validateFile(mkFile("a.ppt", 10), 50)).toBe("pptx");
  });
  it("rejects unsupported types, oversize and empty files", () => {
    expect(() => validateFile(mkFile("a.exe", 10), 50)).toThrow(IngestError);
    expect(() => validateFile(mkFile("a.pdf", 51 * 1024 * 1024), 50)).toThrow(
      IngestError,
    );
    expect(() => validateFile(mkFile("a.pdf", 0), 50)).toThrow(IngestError);
  });
});

describe("cleanInline", () => {
  it("collapses whitespace and fixes spacing before punctuation", () => {
    expect(cleanInline("word  ,\t next .")).toBe("word, next.");
  });
  it("mends broken ellipses and normalizes dashes", () => {
    expect(cleanInline("wait . . . then — go")).toBe("wait… then—go");
  });
  it("fixes ligatures", () => {
    expect(cleanInline("ﬁne ﬂow")).toBe("fine flow");
  });
  it("smartens quotes contextually", () => {
    expect(cleanInline('He said "hi"')).toBe("He said “hi”");
    expect(cleanInline("don't stop")).toBe("don’t stop");
  });
  it("strips control characters", () => {
    expect(cleanInline("ab")).toBe("ab");
  });
});

describe("joinLines", () => {
  it("mends hyphenated line breaks", () => {
    expect(joinLines(["some-", "thing else"])).toBe("something else");
  });
  it("joins with single spaces otherwise", () => {
    expect(joinLines(["a", "b"])).toBe("a b");
  });
});

describe("stripGutenberg", () => {
  it("removes header/footer boilerplate", () => {
    const raw =
      "Front matter\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\nReal text here.\n*** END OF THE PROJECT GUTENBERG EBOOK X ***";
    expect(stripGutenberg(raw)).toBe("Real text here.\n");
  });
  it("leaves non-Gutenberg text untouched", () => {
    expect(stripGutenberg("plain")).toBe("plain");
  });
});

describe("isHeading", () => {
  it("accepts common chapter forms", () => {
    expect(isHeading("Chapter 7")).toBe(true);
    expect(isHeading("CHAPTER ONE")).toBe(true);
    expect(isHeading("IV. The Return")).toBe(true);
    expect(isHeading("第一章 開端")).toBe(true);
    expect(isHeading("DRAMATIS PERSONAE")).toBe(true);
    expect(isHeading("Prologue")).toBe(true);
  });
  it("rejects narrative sentences", () => {
    expect(isHeading("He walked home, tired.")).toBe(false);
    expect(
      isHeading(
        "7. The committee met on Tuesday and argued for hours about budgets.",
      ),
    ).toBe(false);
    expect(isHeading("")).toBe(false);
  });
});

describe("buildChapters", () => {
  it("splits on headings and merges tiny false-positive chapters", () => {
    // Paragraphs exceed 50 words so they survive the tiny-chapter merge.
    const lines: RawLine[] = [
      { text: "Chapter One", heading: true },
      {
        text: "It was a dark and stormy night and the rain fell in torrents over the harbor town while the last ferry fought its way home through the swell.",
      },
      {
        text: "By dawn the streets were rivers of broken glass and salt, and every door in the quarter stood open to the wind.",
      },
      { text: "Chapter Two", heading: true },
      {
        text: "The morning arrived with unexpected clarity and warmth over the harbor town while gulls traced slow circles above the masts of sleeping ships.",
      },
      {
        text: "She counted the bells twice before trusting them, then set her cup down and went out into the light while the harbor bell rang across the water.",
      },
    ];
    const chapters = buildChapters(lines);
    expect(chapters.length).toBe(2);
    expect(chapters[0]!.title).toBe("Chapter One");
    expect(chapters[1]!.paras.length).toBeGreaterThan(0);
  });
  it("creates an Opening section when no headings exist", () => {
    const chapters = buildChapters([{ text: "Just some prose here." }]);
    expect(chapters.length).toBe(1);
    expect(chapters[0]!.title).toBe("Opening");
  });
});

describe("fallbackSplit", () => {
  it("keeps short texts whole", () => {
    const paras = ["one two three"];
    expect(fallbackSplit(paras, 3)[0]!.title).toBe("Full text");
  });
  it("splits long texts on paragraph boundaries only", () => {
    const para = "word ".repeat(120).trim(); // ~120 words
    const paras = Array.from({ length: 60 }, (_, i) => `${para} ${i}`);
    const parts = fallbackSplit(paras, 60 * 120);
    expect(parts.length).toBeGreaterThan(1);
    const all = parts.flatMap((p) => p.paras);
    expect(all.length).toBe(paras.length); // no paragraph lost or split
  });
});

describe("toChapters", () => {
  it("assigns sequential ids and a global chunk cursor", () => {
    const chapters = toChapters([
      { title: "A", paras: ["x", "y"] },
      { title: "B", paras: ["z"] },
    ]);
    expect(chapters[0]!.startChunk).toBe(0);
    expect(chapters[1]!.startChunk).toBe(2);
    expect(chapters[1]!.chunks[0]!.id).toBe("ch1:0");
    expect(globalChunkCount(chapters)).toBe(3);
  });
});

describe("metaFromFilename / titleCase", () => {
  it("parses 'Author - Title' names", () => {
    expect(metaFromFilename("jane austen - emma.pdf")).toEqual({
      author: "Jane Austen",
      title: "Emma",
    });
  });
  it("parses 'Title (Author)' names", () => {
    expect(metaFromFilename("Dracula (Bram Stoker).epub")).toEqual({
      title: "Dracula",
      author: "Bram Stoker",
    });
  });
  it("keeps existing ALL-CAPS words intact", () => {
    expect(titleCase("THE BBC FILES")).toBe("THE BBC FILES");
  });
});

describe("detectLanguage", () => {
  it("detects English via stopwords", () => {
    expect(
      detectLanguage("the cat and the dog was in the house and it is"),
    ).toBe("en");
  });
  it("returns und for non-English text", () => {
    expect(
      detectLanguage("une fois dans un village lointain vivait une famille"),
    ).toBe("und");
  });
});

describe("scoreQuality", () => {
  it("scores clean prose highly", () => {
    const text =
      "The quiet harbor held its breath beneath a silver sky while gulls traced slow circles above the masts of sleeping ships and the tide whispered against old stone walls. ".repeat(
        6,
      );
    const notes: string[] = [];
    const q = scoreQuality(text, 3, notes);
    expect(q.score).toBeGreaterThan(80);
    expect(q.notes.length).toBe(0);
  });
  it("penalizes garbage-heavy text", () => {
    const notes: string[] = [];
    const q = scoreQuality(" ".repeat(200), 1, notes);
    expect(q.score).toBeLessThan(80);
    expect(q.notes.length).toBeGreaterThan(0);
  });
});

describe("dedupeRunningHeads", () => {
  it("removes repeated short header lines", () => {
    const lines: RawLine[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push({ text: "CHAPTER X" });
      lines.push({ text: `Paragraph number ${i} with unique content.` });
    }
    const { lines: kept, removed } = dedupeRunningHeads(lines);
    expect(removed).toBe(10);
    expect(kept.length).toBe(10);
  });
});

describe("chapterAtChunk", () => {
  const chapters = toChapters([
    { title: "A", paras: ["1", "2"] },
    { title: "B", paras: ["3"] },
  ]);
  it("maps global indices to chapter + local position", () => {
    expect(chapterAtChunk(chapters, 0)).toEqual({
      chapterIndex: 0,
      localIndex: 0,
    });
    expect(chapterAtChunk(chapters, 2)).toEqual({
      chapterIndex: 1,
      localIndex: 0,
    });
  });
  it("clamps out-of-range indices to the last chapter", () => {
    expect(chapterAtChunk(chapters, 99).chapterIndex).toBe(1);
  });
});

describe("verifyParsed", () => {
  it("rejects documents with no chapters or no text", () => {
    expect(verifyParsed({ chapters: [], wordCount: 0 } as never).ok).toBe(
      false,
    );
    const empty = toChapters([{ title: "A", paras: [""] }]);
    expect(verifyParsed({ chapters: empty, wordCount: 0 } as never).ok).toBe(
      false,
    );
  });
  it("accepts a healthy parse", () => {
    const doc = toChapters([
      { title: "A", paras: ["Some real content here."] },
    ]);
    const res = verifyParsed({ chapters: doc, wordCount: 20 } as never);
    expect(res.ok).toBe(true);
  });
});
