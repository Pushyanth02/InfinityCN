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
