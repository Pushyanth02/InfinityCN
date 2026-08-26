import { describe, it, expect } from "vitest";
import {
  parseSse,
  extractJson,
  mapModelRaw,
  rankFreeModels,
  dedupeSceneTitles,
  detectDepth,
  ankaaSectionsFor,
  ankaaSteps,
  type RawCatalogModel,
} from "./ai";
import type { AiModelInfo, SceneDraft } from "./types";

/** Newline helper — keeps multi-line fixture strings readable without
 *  relying on escape sequences surviving editor formatting. */
const NL = String.fromCharCode(10);
const lines = (...ls: string[]): string => ls.join(NL);

/* ---------- parseSse ---------- */

describe("parseSse", () => {
  it("splits complete data events and keeps the trailing partial as rest", () => {
    const buf = lines('data: {"a":1}', "", 'data: {"b":2}', "", 'data: {"par');
    const { events, rest } = parseSse(buf);
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"par');
  });

  it("ignores comment / event lines and trims data payloads", () => {
    const { events } = parseSse(
      lines(": keepalive", " event: x", " data:  hello ", ""),
    );
    expect(events).toEqual(["hello"]);
  });

  it("returns no events for an empty buffer", () => {
    const { events, rest } = parseSse("");
    expect(events).toEqual([]);
    expect(rest).toBe("");
  });
});

/* ---------- extractJson ---------- */

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"x": 1}')).toEqual({ x: 1 });
  });

  it("parses a fenced json block", () => {
    expect(extractJson(lines("```json", '{"x": [1,2]}', "```"))).toEqual({
      x: [1, 2],
    });
  });

  it("finds JSON embedded in surrounding prose", () => {
    expect(
      extractJson(
        lines("Sure! Here you go:", '{"title":"Book"}', "Hope that helps."),
      ),
    ).toEqual({ title: "Book" });
  });

  it("handles braces inside strings without losing depth", () => {
    const raw = '{"text":"a } b { c","n":2} trailing }';
    expect(extractJson(raw)).toEqual({ text: "a } b { c", n: 2 });
  });

  it("handles escaped quotes inside strings", () => {
    const BS = String.fromCharCode(92); // backslash, kept out of source escapes
    const payload = '{"q":"he said ' + BS + '"hi' + BS + '"' + '"}';
    expect(extractJson(payload + " done")).toEqual({ q: 'he said "hi"' });
  });

  it("parses arrays as well as objects", () => {
    expect(extractJson('[1, 2, {"k":"v"}]')).toEqual([1, 2, { k: "v" }]);
  });

  it("throws when there is no JSON payload", () => {
    expect(() => extractJson("no structured data here")).toThrow();
  });

  it("throws on unterminated JSON", () => {
    expect(() => extractJson('{"x": 1')).toThrow(/Unterminated/);
  });
});

/* ---------- mapModelRaw ---------- */

const rawModel = (
  id: string,
  over: Partial<RawCatalogModel> = {},
): RawCatalogModel => ({
  id,
  name: id.toUpperCase(),
  context_length: 8192,
  pricing: { prompt: "0.000002", completion: "0.000004" },
  ...over,
});

describe("mapModelRaw", () => {
  it("keeps only :free variants", () => {
    const out = mapModelRaw([
      rawModel("a/big:free"),
      rawModel("b/paid"),
      rawModel("c/mid:free"),
    ]);
    expect(out.map((m) => m.id)).toEqual(["a/big:free", "c/mid:free"]);
  });

  it("drops per-user fine-tunes", () => {
    const out = mapModelRaw([
      rawModel("vendor/model:free"),
      rawModel("vendor/model:user/alice/ft:free"),
    ]);
    expect(out.map((m) => m.id)).toEqual(["vendor/model:free"]);
  });

  it("converts string pricing to dollars-per-million tokens", () => {
    const out = mapModelRaw([rawModel("m/x:free")]);
    expect(out[0]?.inPerM).toBeCloseTo(2);
    expect(out[0]?.outPerM).toBeCloseTo(4);
  });

  it("sorts by display name", () => {
    const out = mapModelRaw([
      rawModel("z/last:free", { name: "Zeta" }),
      rawModel("a/first:free", { name: "Alpha" }),
    ]);
    expect(out.map((m) => m.name)).toEqual(["Alpha", "Zeta"]);
  });
});

/* ---------- rankFreeModels ---------- */

const info = (id: string, context = 8192): AiModelInfo => ({
  id,
  name: id,
  context,
  inPerM: 0,
  outPerM: 0,
});

describe("rankFreeModels", () => {
  it("filters the catalog down to :free models only", () => {
    const ranked = rankFreeModels(
      [info("a/paid"), info("b/free:free")],
      "luma",
    );
    expect(ranked.map((m) => m.id)).toEqual(["b/free:free"]);
  });

  it("ranks known fast families above unknown small models for luma", () => {
    const ranked = rankFreeModels(
      [info("tiny/unknown-1b:free"), info("google/gemini-2.0-flash:free")],
      "luma",
    );
    expect(ranked[0]?.id).toBe("google/gemini-2.0-flash:free");
  });

  it("penalizes code models below general chat models", () => {
    const ranked = rankFreeModels(
      [
        info("deepseek/deepseek-coder:free"),
        info("meta-llama/llama-3.1-8b-instruct:free"),
      ],
      "ouro",
    );
    expect(ranked[0]?.id).toContain("llama");
  });

  it("is deterministic across repeated calls", () => {
    const catalog = [
      info("mistralai/mistral-7b-instruct:free"),
      info("meta-llama/llama-3.3-70b-instruct:free"),
      info("qwen/qwen-2.5-7b-instruct:free"),
    ];
    const a = rankFreeModels(catalog, "ankaa").map((m) => m.id);
    const b = rankFreeModels(catalog, "ankaa").map((m) => m.id);
    expect(a).toEqual(b);
  });
});

/* ---------- dedupeSceneTitles ---------- */

const scene = (title: string): SceneDraft => ({
  title,
  mood: "tense · night · interior",
  characters: ["A", "B"],
  body: "x".repeat(150),
});

describe("dedupeSceneTitles", () => {
  it("suffixes duplicate titles with roman numerals", () => {
    const out = dedupeSceneTitles([
      scene("The Door"),
      scene("The Door"),
      scene("The Door"),
    ]);
    expect(out.map((s) => s.title)).toEqual([
      "The Door",
      "The Door — II",
      "The Door — III",
    ]);
  });

  it("matches case-insensitively and trims whitespace", () => {
    const out = dedupeSceneTitles([scene("the lamp "), scene("The Lamp")]);
    expect(out[1]?.title).toBe("The Lamp — II");
  });

  it("strips a previously applied suffix before re-suffixing", () => {
    const out = dedupeSceneTitles([
      scene("Salt"),
      scene("Salt"),
      scene("Salt — II"),
    ]);
    expect(out.map((s) => s.title)).toEqual([
      "Salt",
      "Salt — II",
      "Salt — III",
    ]);
  });

  it("leaves unique titles untouched", () => {
    const titles = ["A", "B", "C"];
    expect(dedupeSceneTitles(titles.map(scene)).map((s) => s.title)).toEqual(
      titles,
    );
  });
});

/* ---------- detectDepth / ankaaSteps ---------- */

describe("detectDepth", () => {
  it("goes long whenever a source document is attached", () => {
    expect(detectDepth("a lamp", {} as never)).toBe("long");
  });

  it("honors explicit long-form cues even on short prompts", () => {
    expect(detectDepth("write a novel about tides", null)).toBe("long");
  });

  it("honors explicit short-form cues", () => {
    expect(detectDepth("a brief vignette of rain", null)).toBe("short");
  });

  it("falls back to prompt length", () => {
    expect(detectDepth("a lamp", null)).toBe("short");
    expect(detectDepth("x".repeat(200), null)).toBe("long");
    expect(detectDepth("x".repeat(80), null)).toBe("medium");
  });
});

describe("ankaaSectionsFor / ankaaSteps", () => {
  it("maps depth to section counts", () => {
    expect(ankaaSectionsFor("short")).toBe(2);
    expect(ankaaSectionsFor("medium")).toBe(3);
    expect(ankaaSectionsFor("long")).toBe(5);
  });

  it("keeps the step list consistent with the section count", () => {
    for (const d of ["short", "medium", "long"] as const) {
      const steps = ankaaSteps(d);
      expect(steps.length).toBe(ankaaSectionsFor(d) + 3);
      expect(steps[steps.length - 1]).toMatch(/Binding/);
    }
  });
});

/* ---------- AI system upgrade: context, memory, sampling, health ---------- */

import { buildLumaContext, compactHistory, lumaSuggestions, samplingFor } from "./ai";
import { healthBoost, observeModel, resetModelHealth } from "./modelHealth";
import type { DocumentRow } from "./types";

/** Minimal DocumentRow factory (mirrors loa.test.ts's helper). */
const ragDoc = (title: string, chapters: string[][]): DocumentRow => ({
  id: "doc-rag",
  userId: "user-1",
  title,
  author: "A. Writer",
  sourceType: "txt",
  mimeType: "text/plain",
  byteSize: 1024,
  status: "ready",
  error: null,
  warnings: [],
  summary: null,
  language: "en",
  coverGradient: "",
  contentJson: {
    chapters: chapters.map((chunks, ci) => ({
      id: `ch-${ci}`,
      title: `Chapter ${ci + 1}`,
      startChunk: 0,
      chunks: chunks.map((t, i) => ({
        id: `k-${ci}-${i}`,
        kind: "p" as const,
        text: t,
      })),
    })),
  },
  chapterCount: chapters.length,
  wordCount: 0,
  charCount: 0,
  createdAt: 0,
  updatedAt: 0,
  lastReadAt: null,
  readingProgress: 0,
  lastChunkIndex: 0,
  favorite: false,
  tags: [],
  collection: null,
});

const fillerSentence =
  "The harbor kept its usual noises, gulls arguing over nothing in particular.";

describe("buildLumaContext", () => {
  it("uses legacy prefix slices for short chapters", () => {
    const doc = ragDoc("T", [[fillerSentence]]);
    const c = buildLumaContext(doc, 0, "what about the lighthouse?");
    expect(c.augmented).toBe(false);
    expect(c.cur).toBe(fillerSentence);
  });

  it("retrieves question-relevant passages from deep in long chapters", () => {
    // Build a chapter >9000 chars where the distinctive content sits at the END.
    const tail =
      "The alabaster compass spun wildly whenever the fog thickened beyond reason.";
    const body: string[] = [];
    for (let i = 0; i < 110; i++)
      body.push(
        `${fillerSentence} Wave ${i} broke against the seawall and retreated.`,
      );
    const doc = ragDoc("Long Book", [[[...body, tail].join(" ")]]);
    const c = buildLumaContext(doc, 0, "alabaster compass fog");
    expect(c.augmented).toBe(true);
    // The retrieved passage containing the distinctive terms must be present.
    expect(c.cur).toContain("alabaster compass");
    // …and the whole assembly must respect the context budget.
    expect(c.cur.length).toBeLessThanOrEqual(9200);
  });

  it("falls back to legacy slices when retrieval finds nothing", () => {
    const body: string[] = [];
    for (let i = 0; i < 60; i++) body.push(`${fillerSentence} Line ${i}.`);
    const doc = ragDoc("Long Book", [[body.join(" ")]]);
    const c = buildLumaContext(doc, 0, "quantum entanglement protocol xyzzy");
    expect(c.augmented).toBe(false);
  });
});

describe("compactHistory", () => {
  it("passes short histories through verbatim", () => {
    const h = [
      { role: "user" as const, text: "q1" },
      { role: "assistant" as const, text: "a1" },
    ];
    expect(compactHistory(h)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
    ]);
  });

  it("condenses older turns and keeps the last four verbatim", () => {
    const h = [
      { role: "user" as const, text: "first question about motifs" },
      { role: "assistant" as const, text: "first answer" },
      { role: "user" as const, text: "second question" },
      { role: "assistant" as const, text: "second answer" },
      { role: "user" as const, text: "recent question A" },
      { role: "assistant" as const, text: "recent answer B" },
    ];
    const out = compactHistory(h);
    expect(out[0]?.role).toBe("system");
    expect(out[0]?.content).toContain("Earlier conversation (condensed)");
    expect(out[0]?.content).toContain("first question");
    // Last four turns survive verbatim, in order.
    expect(out.slice(1).map((m) => m.content)).toEqual([
      "second question",
      "second answer",
      "recent question A",
      "recent answer B",
    ]);
  });
});

describe("samplingFor", () => {
  it("assigns creativity by task family", () => {
    expect(samplingFor("cinema:3:1").temperature).toBe(0.85);
    expect(samplingFor("outline:continue").temperature).toBe(0.85);
    expect(samplingFor("study:quiz").temperature).toBe(0.4);
    expect(samplingFor("analysis").temperature).toBe(0.45);
    expect(samplingFor("refine").temperature).toBe(0.35);
    expect(samplingFor("chat").temperature).toBe(0.55);
  });

  it("gives repair round-trips maximum precision regardless of base task", () => {
    expect(samplingFor("study:full:repair").temperature).toBe(0.2);
    expect(samplingFor("outline:whatif:repair").temperature).toBe(0.2);
  });
});

describe("lumaSuggestions", () => {
  it("derives chapter-specific starters from motifs and characters", () => {
    const doc = ragDoc("Motifs", [[
      "Marisol carried the brass lantern everywhere. The brass lantern lit the ledger. " +
        "Marisol wrote nightly. The brass lantern flickered. Marisol smiled.",
    ]]);
    const s = lumaSuggestions(doc, 0);
    expect(s.length).toBeGreaterThan(0);
    expect(s.some((q) => q.includes("brass") || q.includes("Marisol"))).toBe(
      true,
    );
  });

  it("always returns five suggestions (statics as fallback)", () => {
    const doc = ragDoc("Tiny", [["One quiet sentence."]]);
    expect(lumaSuggestions(doc, 0)).toHaveLength(5);
  });
});

describe("modelHealth", () => {
  it("scores unobserved models neutrally", () => {
    resetModelHealth();
    expect(healthBoost("luma", "never/seen:free")).toBe(0);
  });

  it("rewards consistent fast successes above the neutral band", () => {
    resetModelHealth();
    for (let i = 0; i < 6; i++)
      observeModel("luma", "fast/good:free", true, 1500);
    expect(healthBoost("luma", "fast/good:free")).toBeGreaterThan(0);
  });

  it("penalizes models that keep failing", () => {
    resetModelHealth();
    for (let i = 0; i < 8; i++)
      observeModel("ouro", "flaky/bad:free", false, 40_000);
    expect(healthBoost("ouro", "flaky/bad:free")).toBeLessThan(0);
  });

  it("is deterministic and bounded", () => {
    resetModelHealth();
    observeModel("ankaa", "mid/model:free", true, 9_000);
    observeModel("ankaa", "mid/model:free", false, 9_000);
    const a = healthBoost("ankaa", "mid/model:free");
    const b = healthBoost("ankaa", "mid/model:free");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(-90);
    expect(a).toBeLessThanOrEqual(60);
  });
});

