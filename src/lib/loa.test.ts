import { describe, it, expect } from "vitest";
import {
  STOP,
  wordList,
  sentences,
  freqMap,
  topKeywords,
  extractiveSummary,
  findCharacters,
  moodOf,
  moodKey,
  extractThemes,
  extractVocab,
  clozeQuiz,
  buildFlashcards,
  offlineScenes,
  offlineAnkaaLong,
  offlineAnalysis,
  extractAnchors,
  retrievePassages,
  docText,
  chapterText,
  wordCount,
  cap,
  truncateWords,
} from "./loa";
import type { DocumentRow } from "./types";

/* ---------- fixtures ---------- */

const NL = String.fromCharCode(10);
const para = (...ps: string[]): string => ps.join(NL + NL);

/** Minimal but fully-typed DocumentRow factory for engine-free unit tests. */
const fakeDoc = (
  title: string,
  chapters: string[][],
): DocumentRow => ({
  id: "doc-1",
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

/* ---------- tokenization ---------- */

describe("wordList", () => {
  it("lowercases and strips punctuation", () => {
    expect(wordList("Hello, World! It's fine — really.")).toEqual([
      "hello",
      "world",
      "it's",
      "fine",
      "really",
    ]);
  });

  it("handles curly apostrophes, hyphens and unicode letters", () => {
    expect(wordList("don’t x-ray naïve")).toEqual(["don’t", "x-ray", "naïve"]);
  });

  it("returns an empty array for empty input", () => {
    expect(wordList("")).toEqual([]);
  });
});

/* ---------- segmentation ---------- */

describe("sentences", () => {
  it("splits on terminal punctuation followed by a capital", () => {
    const out = sentences("The lamp burned. Ember watched it. Then she left.");
    expect(out).toEqual([
      "The lamp burned.",
      "Ember watched it.",
      "Then she left.",
    ]);
  });

  it("does not split after common abbreviations", () => {
    const out = sentences("Mr. Darcy walked in. Dr. Smith followed him.");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("Mr. Darcy");
  });

  it("does not split decimal numbers", () => {
    expect(sentences("It cost 3.14 dollars. Then taxes applied.")).toHaveLength(
      2,
    );
  });

  it("keeps quoted speech with its boundary punctuation together", () => {
    const out = sentences(para('"Wait here," said Ember. She left the lamp.'));
    expect(out[0]).toContain('"Wait here," said Ember.');
  });

  it("breaks on paragraph boundaries", () => {
    const out = sentences(
      para("First paragraph text here.", "Second arrives."),
    );
    expect(out).toHaveLength(2);
  });

  it("is deterministic for repeated calls", () => {
    const t = "One sentence here. Another follows! A third? Yes.";
    expect(sentences(t)).toEqual(sentences(t));
  });
});

/* ---------- frequency & keywords ---------- */

describe("freqMap", () => {
  it("excludes stop words and short tokens", () => {
    const m = freqMap("the and a of to ember EMBER lamp it is ox");
    expect(m.has("the")).toBe(false);
    expect(m.has("ox")).toBe(false);
    expect(m.get("ember")).toBe(2);
  });

  it("groups morphological variants under their most frequent surface form", () => {
    const m = freqMap(
      "embers flew. ember again. embers everywhere. embers rise. embers fall.",
    );
    // ember ×1, embers ×4 → merged to 5 under the dominant surface form
    expect(m.get("embers")).toBe(5);
  });

  it("merges verb inflections (walk / walked / walking)", () => {
    const m = freqMap("They walk home. She walked home. We were walking home.");
    const total = [...m.entries()]
      .filter(([w]) => w.startsWith("walk"))
      .reduce((a, [, c]) => a + c, 0);
    expect(total).toBe(3);
  });

  it("ignores pure numeric tokens", () => {
    const m = freqMap("In 1492 the voyage began. In 1493 it ended.");
    expect(m.has("1492")).toBe(false);
  });
});

describe("topKeywords", () => {
  it("ranks by informativeness, not just raw count", () => {
    const kw = topKeywords(
      "lamp lamp lamp lamp lantern shadow lantern shadow whisper echo echo",
      4,
    );
    expect(kw).toContain("lamp");
    expect(kw.some((k) => k.includes("lantern") || k.includes("shadow"))).toBe(
      true,
    );
  });

  it("surfaces repeated multi-word motifs as bigram keywords", () => {
    const kw = topKeywords(
      "The dark tower rose. Beneath the dark tower, nothing grew. They fled the dark tower at dawn.",
      8,
    );
    expect(kw).toContain("dark tower");
  });

  it("never returns stop words", () => {
    const kw = topKeywords("the of and to was there then now also very", 10);
    for (const k of kw) {
      for (const part of k.split(" ")) expect(STOP.has(part)).toBe(false);
    }
  });

  it("is deterministic across calls", () => {
    const t = "amber amber amber kettle kettle window window door";
    expect(topKeywords(t, 5)).toEqual(topKeywords(t, 5));
  });
});

/* ---------- summarization ---------- */

describe("extractiveSummary", () => {
  const long = para(
    "The harbor slept beneath a grey quilt of morning fog.",
    "Ember counted the bells twice, because counting once had never once been enough.",
    "Nothing about the black tower had changed in nine hundred years, and yet everyone kept watching it.",
    "The ferryman refused payment, which frightened her more than any demand could have.",
    "By noon the fog lifted and revealed the lantern still burning in the tower window.",
    "She wrote the date in her ledger and underlined it three times.",
    "Somewhere behind the market stalls, a kettle sang to nobody in particular.",
    "That evening the council met and decided, as councils do, to decide nothing at all.",
    "Ember walked home along the seawall with salt drying white on her sleeves.",
  );

  it("returns at most n sentences", () => {
    const s = extractiveSummary(long, 3);
    const count = s.split(/[.!?]+\s/).filter(Boolean).length;
    expect(count).toBeLessThanOrEqual(3);
  });

  it("returns the whole text when it has ≤ n sentences", () => {
    const short = "One line only.";
    expect(extractiveSummary(short, 3)).toBe(short);
  });

  it("is deterministic per (text, n)", () => {
    expect(extractiveSummary(long, 4)).toBe(extractiveSummary(long, 4));
  });

  it("never repeats the same sentence (MMR diversity)", () => {
    const s = extractiveSummary(long, 4);
    const parts = s.split(/(?<=[.!?])\s+/);
    expect(new Set(parts).size).toBe(parts.length);
  });

  it("breaks up redundant clusters so informative sentences surface (n=2)", () => {
    // Three single-sentence near-duplicates form the densest TextRank
    // cluster; the unique informative sentence must win the second slot.
    const t = para(
      "It was a quiet morning above the harbor town.",
      "The treaty of Ashfall ended the border wars and returned the eastern wells.",
      "It was a quiet afternoon above the harbor town.",
      "It was a quiet evening above the harbor town.",
    );
    const s = extractiveSummary(t, 2);
    expect(s).toContain("Ashfall");
  });
});

/* ---------- character detection ---------- */

describe("findCharacters", () => {
  const cast = para(
    "Ember said goodnight to no one in particular.",
    "Ember walked home through the square, past the shuttered bakery.",
    "She carried her father's old lamp. Hers glowed more stubbornly than most.",
    "The lamps along the lane dimmed politely as she passed them.",
    '"Lamps don\'t mind waiting," he had told her once.',
  );

  it("detects recurring proper names adjacent to dialogue verbs", () => {
    const chars = findCharacters(cast, 5);
    expect(chars.map((c) => c.name)).toContain("Ember");
  });

  it("never returns pronouns, possessives or articles", () => {
    const chars = findCharacters(cast, 8);
    const banned = ["She", "Hers", "Her", "The", "He"];
    for (const c of chars) expect(banned).not.toContain(c.name);
  });

  it("suppresses common nouns capitalized only at sentence start", () => {
    const chars = findCharacters(cast, 8);
    expect(chars.map((c) => c.name)).not.toContain("Lamps");
  });

  it("includes first-mention context notes", () => {
    const chars = findCharacters(cast, 5);
    const ember = chars.find((c) => c.name === "Ember");
    expect(ember?.note.length ?? 0).toBeGreaterThan(0);
  });
});

/* ---------- mood classification ---------- */

describe("moodOf / moodKey", () => {
  it("matches lexicon words on word boundaries, not substrings", () => {
    // "beholden" contains "old" — a substring classifier mis-reads this as
    // tender sorrow; token-level matching must not.
    const t = para(
      "We were beholden to the ferryman for the crossing.",
      "He rowed without speaking. The boat leaked slightly.",
      "Nobody minded the leak or the silence between strokes.",
    );
    expect(moodOf(t)).not.toMatch(/^tender sorrow/);
  });

  it("classifies warm hearth imagery as ember warmth", () => {
    const t = para(
      "The hearth crackled and the kettle hummed its one warm note.",
      "Candlelight gilded every shelf; bread and tea perfumed the kitchen.",
      "They wrapped their hands around the fire-warmed mugs and settled in.",
    );
    expect(moodKey(t)).toBe("ember warmth");
  });

  it("reports unmarked atmosphere when signal is absent instead of guessing", () => {
    const t = para(
      "The invoice listed forty spools of linen thread.",
      "A second page recorded the freight charges in careful columns.",
      "At the bottom, someone had totaled the sums twice in different ink.",
    );
    expect(moodOf(t)).toMatch(/^unmarked atmosphere/);
  });

  it("always ends with an interiority tag", () => {
    const m = moodOf("The hearth glowed. The kettle warmed the dark room.");
    expect(m.endsWith("interior") || m.endsWith("exterior")).toBe(true);
  });

  it("is deterministic", () => {
    const t = "cold wind bit the empty street. frost crept under the door.";
    expect(moodOf(t)).toBe(moodOf(t));
  });
});

/* ---------- themes & vocab ---------- */

describe("extractThemes", () => {
  it("capitalizes theme names and provides non-empty notes", () => {
    const t = para(
      "Memory returns to Ember each night like a tide that keeps its promises.",
      "The memory of the tower bell outlived the bell itself.",
      "Grief, too, kept house with memory; they shared the same narrow bed.",
      "Ships pass, but memory anchors where anchor chains rust through.",
    );
    const themes = extractThemes(t, 3);
    expect(themes.length).toBeGreaterThan(0);
    for (const th of themes) {
      expect(th.name.length).toBeGreaterThan(0);
      expect(th.note.length).toBeGreaterThan(0);
    }
  });

  it("maps chapter distribution when chapters are provided", () => {
    const chapters = [
      { title: "One", text: "ember ember ember stone" },
      { title: "Two", text: "stone stone stone" },
    ];
    const themes = extractThemes(
      "ember stone ember stone lantern",
      2,
      chapters,
    );
    const ember = themes.find((th) =>
      th.name.toLowerCase().includes("ember"),
    );
    expect(ember?.distribution?.[0]?.count ?? 0).toBeGreaterThan(
      ember?.distribution?.[1]?.count ?? 0,
    );
  });
});

describe("extractVocab", () => {
  it("selects rare, load-bearing words with real context sentences", () => {
    const t = para(
      "The palimpsest of the harbor ledger defied easy reading.",
      "Every marginalia note whispered against the official account.",
      "Her annotations preserved the palimpsest exactly as received.",
    );
    const vocab = extractVocab(t, 5);
    expect(vocab.length).toBeGreaterThan(0);
    for (const v of vocab) {
      expect(v.term.length).toBeGreaterThanOrEqual(7);
      expect(v.context.length).toBeGreaterThan(0);
    }
  });
});

/* ---------- cloze quiz ---------- */

describe("clozeQuiz", () => {
  const quizText = para(
    "The lamplighter carried her brass pole through the winding streets.",
    "Every evening she lit exactly forty-one lamps and counted them aloud.",
    "The merchant district demanded brighter flames than the harbor quarter.",
    "Children followed her at a respectful distance, hoping for spilled light.",
    "On stormy nights the winds mocked her ladder and scattered her matches.",
    "She never complained, though her ledger recorded every broken pane.",
    "Winter shortened her rounds but never shortened her patience.",
  );

  it("is deterministic per (text, n)", () => {
    expect(clozeQuiz(quizText, 6)).toEqual(clozeQuiz(quizText, 6));
  });

  it("produces structurally valid questions", () => {
    const qs = clozeQuiz(quizText, 6);
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      expect(q.options.length).toBe(4);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(q.q).toContain("____");
      expect(q.why.length).toBeGreaterThan(0);
    }
  });

  it("chooses distractors that are not inflections of the answer", () => {
    const qs = clozeQuiz(quizText, 8);
    for (const q of qs) {
      const answer = (q.options[q.answer] ?? "").toLowerCase();
      const answerStem = answer.replace(/(ing|ed|s)$/, "");
      for (let i = 0; i < q.options.length; i++) {
        if (i === q.answer) continue;
        const stem = (q.options[i] ?? "").toLowerCase().replace(/(ing|ed|s)$/, "");
        expect(stem).not.toBe(answerStem);
      }
    }
  });
});

/* ---------- BM25 retrieval ---------- */

describe("retrievePassages", () => {
  const book = para(
    "The black tower stood over the harbor like a closed fist.",
    "Fishing boats came home at dusk trailing silver bells and gossip.",
    "The tower keeper lit a small lantern in the high window every evening.",
    "Market day brought oranges, arguments, and rumors about the tower taxes.",
    "Nobody had entered the tower since the keeper's grandfather kept it.",
  );

  it("ranks the passage containing the distinctive query terms first", () => {
    const hits = retrievePassages(book, "who lights the tower lantern", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.text).toContain("lantern");
  });

  it("weights rare terms above ubiquitous ones", () => {
    const hits = retrievePassages(book, "oranges", 1);
    expect(hits[0]?.text).toContain("oranges");
  });

  it("returns valid scores and indices", () => {
    const hits = retrievePassages(book, "harbor boats", 2);
    for (const h of hits) {
      expect(h.score).toBeGreaterThan(0);
      expect(h.index).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns an empty array when nothing matches", () => {
    expect(retrievePassages(book, "quantum entanglement protocol", 3)).toEqual(
      [],
    );
  });

  it("handles empty inputs gracefully", () => {
    expect(retrievePassages("", "query", 3)).toEqual([]);
    expect(retrievePassages("text here", "", 3)).toEqual([]);
  });
});

/* ---------- generation ---------- */

describe("offlineScenes", () => {
  it("produces scene drafts with all fields populated", () => {
    const doc = fakeDoc("The Ember House", [
      [
        para(
          "Ember climbed the tower stairs. The lantern waited at the top, patient as debt.",
          "She trimmed the wick and the flame steadied, throwing shadows up the stairwell.",
          "Below, the harbor rearranged its lights for the night.",
          '"Same time tomorrow," said the tower, in the way towers say things.',
          "She agreed, and descended, and the dark closed politely behind her.",
        ),
      ],
    ]);
    const scenes = offlineScenes(doc, 0);
    expect(scenes.length).toBeGreaterThan(0);
    for (const s of scenes) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.mood.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });
});

describe("extractAnchors", () => {
  it("extracts capitalized names but skips prompt command verbs", () => {
    const a = extractAnchors(
      "Write a story about Marisol and the Keeper of Vellum House",
    );
    expect(a.cast.join(" ")).toContain("Marisol");
    expect(a.cast[0]).not.toBe("Write");
  });

  it("pulls keywords from the prompt body", () => {
    const a = extractAnchors("Write about lighthouses, betrayal, and salt");
    expect(a.keywords.length).toBeGreaterThan(0);
  });
});

describe("offlineAnkaaLong", () => {
  const doc = fakeDoc("Ledger of Small Hours", [
    [
      para(
        "Ember kept the ledger. The kettle disagreed with the clock nightly.",
        "Nothing in Vellum House happened on schedule, which suited everyone eventually.",
        "The stairs creaked in a key only the house understood.",
        '"Tomorrow," said Ember, meaning it for the first time.',
        "Outside, the fog signed its name across the window and left.",
      ),
    ],
  ]);

  it("is deterministic for identical (mode, doc, prompt, nonce)", () => {
    const a = offlineAnkaaLong("continue", doc, "continue the story", 7, "medium");
    const b = offlineAnkaaLong("continue", doc, "continue the story", 7, "medium");
    expect(a.title).toBe(b.title);
    expect(a.body).toBe(b.body);
  });

  it("varies output across nonces", () => {
    const bodies = new Set(
      [0, 1, 2].map((n) =>
        offlineAnkaaLong("continue", doc, "continue", n, "long").body,
      ),
    );
    expect(bodies.size).toBeGreaterThan(1);
  });

  it("respects depth budgets (short produces fewer paragraphs than long)", () => {
    const short = offlineAnkaaLong("chapter", doc, "next morning", 3, "short");
    const long = offlineAnkaaLong("chapter", doc, "next morning", 3, "long");
    const count = (s: string) => s.split(NL + NL).length;
    expect(count(short.body)).toBeLessThan(count(long.body));
  });

  it("works without a document", () => {
    const r = offlineAnkaaLong(
      "whatif",
      null,
      "a story about Wren and the Clockmaker",
      1,
      "short",
    );
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.body.length).toBeGreaterThan(100);
  });
});

describe("offlineAnalysis", () => {
  it("returns summary, themes, characters and grounded criticism", () => {
    const doc = fakeDoc("The Bell Ledger", [
      [
        para(
          "Marisol inherited the bell ledger from a grandmother she never met.",
          "Each entry paired a death with the exact tone of the passing bell.",
          "The town found comfort in her precision, or pretended to.",
          "When the great bell cracked, grief went unmetered for the first winter.",
          '"We will manage," said Marisol, who managed nothing else that year.',
        ),
      ],
    ]);
    const a = offlineAnalysis(doc);
    expect(a.summary.length).toBeGreaterThan(0);
    expect(a.themes.length).toBeGreaterThan(0);
    expect(a.characters.map((c) => c.name)).toContain("Marisol");
    expect(a.criticism).toContain("The Bell Ledger");
  });
});

/* ---------- study artifacts & helpers ---------- */

describe("buildFlashcards", () => {
  it("combines vocabulary and character cards", () => {
    const doc = fakeDoc("Small Hours", [
      ["The palimpsest resisted every scholarly instrument. Ember studied anyway."],
    ]);
    const cards = buildFlashcards(doc, docText(doc));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.front.length).toBeGreaterThan(0);
      expect(c.back.length).toBeGreaterThan(0);
    }
  });
});

describe("helpers", () => {
  it("cap capitalizes the first letter", () => {
    expect(cap("ember")).toBe("Ember");
    expect(cap("")).toBe("");
  });

  it("wordCount counts whitespace-separated words", () => {
    expect(wordCount("one two  three\nfour")).toBe(4);
  });

  it("truncateWords truncates with an ellipsis", () => {
    expect(truncateWords("a b c d e f", 3)).toBe("a b c…");
    expect(truncateWords("a b", 3)).toBe("a b");
  });

  it("docText joins chapter chunks with paragraph breaks", () => {
    const doc = fakeDoc("T", [["alpha"], ["beta", "gamma"]]);
    expect(docText(doc)).toContain("alpha");
    expect(docText(doc)).toContain("beta" + NL + NL + "gamma");
  });

  it("chapterText clamps out-of-range indices", () => {
    const doc = fakeDoc("T", [["only chapter"]]);
    expect(chapterText(doc, 99)).toBe("only chapter");
    expect(chapterText(doc, -5)).toBe("only chapter");
  });
});
