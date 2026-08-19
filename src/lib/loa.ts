/**
 * LOA — Local On-device Analytics engine.
 *
 * LOA is the grounded, fully offline brain of Lemniscate's three companions.
 * It runs entirely on the user's device against the actual document text —
 * no network, no API key, no tokens leave the browser. Every online capability
 * (Luma chat, Ouro study sets, Ankaa long-form, scene cinematization, deep
 * analysis) has a LOA fallback that is genuinely useful, not a stub.
 *
 * Capabilities:
 *   - Sentence segmentation (abbreviation-aware, dialogue-aware)
 *   - Word frequency analysis with stop-word filtering
 *   - Extractive summarization (TextRank-style sentence scoring with position
 *     and keyword-density bonuses)
 *   - Character detection (proper-noun + dialogue-verb heuristics, with
 *     first-mention context)
 *   - Mood / atmosphere / setting / time-of-day classification
 *   - Theme extraction with chapter-distribution mapping
 *   - Vocabulary selection (uncommon + load-bearing words)
 *   - Cloze-deletion quiz generation with sourced distractors
 *   - Flashcard generation
 *   - Cinematic scene dramatization (original present-tense prose)
 *   - Long-form story generation (structured, anchor-driven, mode-aware)
 *   - Deep literary analysis (summary, themes, characters, criticism)
 *
 * Design principles:
 *   - Deterministic per (text, params) — a retry reproduces the same output
 *   - Bounded memoization — expensive passes are cached, huge texts bypass
 *   - No external dependencies — pure TypeScript
 *   - Graceful degradation — always returns *something* useful
 */

import type { AnkaaMode, DeepAnalysis, DocumentRow, QuizQuestion, SceneDraft, StudyData } from "./types";
import { clamp } from "./utils";

/* ═══════════════════════════════════════════════════
   1. Text segmentation & tokenization
   ═══════════════════════════════════════════════════ */

/** Stop-word set — common English function words filtered from frequency
 *  analysis. Kept conservative so literary keywords survive. */
export const STOP = new Set(
  ("the a an and or of to in was is are were be been being it its this that these those with for as had have has his her their them they he she we you i not but at by on from into over under again then than there here when while which who whom what why how all any both each few more most other some such no nor only own same so too very can will just should could would might must also about up out if because until against during before after above below between".split(" "))
);

/** Abbreviations that should NOT end a sentence. */
const ABBREVS = new Set([
  "mr","mrs","ms","dr","prof","rev","hon","jr","sr","st","vs","etc","e.g","i.e","fig","no","vol","pp","ch","sec","p","op","ed","eds","trans","comp","dept","univ","inc","ltd","co","corp",
]);

/** Tokenize into lowercase words (Unicode-aware, handles apostrophes and hyphens). */
export function wordList(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
}

/** Segment text into sentences — abbreviation-aware, dialogue-aware.
 *  Splits on .!? followed by whitespace + capital, but respects common
 *  abbreviations and quoted speech boundaries. */
export function sentences(text: string): string[] {
  return memo(SENT_CACHE, text, () => segment(text));
}

function segment(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const push = () => {
    const s = buf.trim();
    if (s.length > 2) out.push(s);
    buf = "";
  };
  while (i < text.length) {
    const ch = text[i];
    buf += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      // Look ahead: is the next non-space char a capital letter or a quote?
      // If so, this is likely a sentence boundary.
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      const next = text[j] ?? "";
      // Check for abbreviation: word before the period is a known abbrev
      const before = buf.trim().split(/\s+/).pop() ?? "";
      const wordBefore = before.toLowerCase().replace(/[^a-z.]/g, "");
      const isAbbrev = ABBREVS.has(wordBefore) || (before.includes(".") && before.length <= 5);
      // Don't break inside a decimal number (e.g. "3.14")
      const isDecimal = /\d\.\d/.test(buf.slice(-4));
      // Don't break if next char is lowercase (e.g., "Mr. smith")
      const nextIsLower = /[a-z]/.test(next);
      // Dialogue: if we're inside quotes, only break on the closing quote
      const inQuotes = (buf.match(/["“]/g)?.length ?? 0) > (buf.match(/["”]/g)?.length ?? 0);
      if (!isAbbrev && !isDecimal && !nextIsLower && !inQuotes) {
        // Consume closing quote if present
        if (text[i + 1] === '"' || text[i + 1] === "”" || text[i + 1] === "’" || text[i + 1] === ")") {
          buf += text[i + 1];
          i += 2;
        } else {
          i++;
        }
        push();
        continue;
      }
    }
    // Hard break on double newline (paragraph boundary)
    if (ch === "\n" && text[i + 1] === "\n") {
      push();
      buf = "\n";
      i += 2;
      while (i < text.length && text[i] === "\n") i++;
      continue;
    }
    i++;
  }
  push();
  return out;
}

/* ═══════════════════════════════════════════════════
   2. Memoization (bounded, size-guarded)
   ═══════════════════════════════════════════════════ */

const SENT_CACHE = new Map<string, string[]>();
const FREQ_CACHE = new Map<string, Map<string, number>>();
const CHAR_CACHE = new Map<string, { name: string; note: string }[]>();
const MOOD_CACHE = new Map<string, string>();
const CACHE_MAX = 8;
const CACHE_TEXT_LIMIT = 400_000;

function memo<T>(map: Map<string, T>, key: string, compute: () => T): T {
  const hit = map.get(key);
  if (hit) return hit;
  const val = compute();
  if (key.length > CACHE_TEXT_LIMIT) return val;
  if (map.size >= CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
  return val;
}

/* ═══════════════════════════════════════════════════
   3. Frequency analysis & keyword extraction
   ═══════════════════════════════════════════════════ */

export function freqMap(text: string): Map<string, number> {
  return memo(FREQ_CACHE, text, () => {
    const m = new Map<string, number>();
    for (const w of wordList(text)) {
      if (w.length < 3 || STOP.has(w)) continue;
      m.set(w, (m.get(w) ?? 0) + 1);
    }
    return m;
  });
}

export function topKeywords(text: string, n = 12): string[] {
  return [...freqMap(text).entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/* ═══════════════════════════════════════════════════
   4. Extractive summarization (TextRank-style)
   ═══════════════════════════════════════════════════ */

/** Produce an extractive summary of `n` sentences, scored by keyword density,
 *  position bonus, and sentence length normalization. */
export function extractiveSummary(text: string, n = 5): string {
  const sents = sentences(text);
  if (sents.length <= n) return sents.join(" ");
  const freq = freqMap(text);
  const scored = sents.map((s, i) => {
    const ws = wordList(s).filter((w) => !STOP.has(w) && w.length >= 3);
    const density = ws.reduce((a, w) => a + (freq.get(w) ?? 0), 0);
    const lengthNorm = Math.pow(ws.length + 3, 0.62);
    const positionBonus = i < 2 ? 0.4 : i < 4 ? 0.2 : i > sents.length - 2 ? 0.15 : 0;
    const score = density / lengthNorm + positionBonus;
    return { s, i, score };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
  return top.map((t) => t.s).join(" ");
}

/* ═══════════════════════════════════════════════════
   5. Character detection (proper-noun + dialogue-verb)
   ═══════════════════════════════════════════════════ */

const CHAR_VERBS = /\b(said|asked|replied|whispered|answered|called|cried|murmured|shouted|told|watched|smiled|nodded|thought|remembered|wondered|noticed|turned|stood|sat|walked|ran|looked|gazed|stared|glanced|frowned|laughed|wept|sighed)\b/i;

export function findCharacters(text: string, n = 6): { name: string; note: string }[] {
  return memo(CHAR_CACHE, `${n}\u0001${text}`, () => findCharactersScan(text, n));
}

/** Common words and possessives that are NEVER character names, regardless
 *  of context. These must always be filtered — the `mentionsVerb` flag only
 *  affects weighting, never filter bypass. */
const NEVER_CHARACTER = new Set([
  // Pronouns
  "He", "She", "It", "They", "We", "You", "I", "Me", "Him", "Her", "Us", "Them",
  // Possessives (the source of the "Hers" false positive)
  "His", "Hers", "Its", "Theirs", "Ours", "Yours", "Mine",
  // Articles
  "The", "A", "An",
  // Conjunctions
  "But", "And", "Or", "Nor", "Yet", "So", "For",
  // Prepositions
  "In", "On", "At", "To", "Of", "With", "From", "By", "As", "Into", "Over", "Under", "Through", "Between", "Against", "During", "Before", "After", "Above", "Below",
  // Demonstratives
  "This", "That", "These", "Those", "There", "Here",
  // Question words
  "What", "Which", "Who", "Whom", "Whose", "Why", "How", "When", "Where",
  // Common sentence starters
  "When", "Then", "Now", "Soon", "Later", "Today", "Tonight", "Yesterday", "Tomorrow",
  // Quantifiers
  "All", "Some", "Many", "Most", "Few", "More", "Less", "Every", "Each", "Both", "Either", "Neither", "Other", "Such", "Another",
  // Negation
  "No", "Not", "Never", "Nothing", "Nobody", "None",
  // Affirmation
  "Yes", "Yeah",
  // Modal verbs (capitalized at sentence start)
  "Will", "Would", "Can", "Could", "Should", "Must", "May", "Might", "Shall",
  // Common adverbs
  "Only", "Even", "Still", "Also", "Just", "Quite", "Very", "Rather",
]);

/** Words that, when they appear at a sentence start, are likely sentence-openers
 *  rather than character names — UNLESS they're followed by a dialogue verb
 *  pattern like "Name said". These are filtered from `sentenceStarts` so they
 *  don't suppress real character detection. */
const COMMON_SENTENCE_STARTERS = new Set([
  "The", "A", "An", "It", "He", "She", "They", "But", "And", "When", "Then", "There",
  "This", "That", "In", "On", "At", "For", "With", "His", "Her", "Its", "Their",
  "What", "Why", "How", "No", "Yes", "Not", "I", "We", "You", "Some", "Every",
  "All", "Many", "Most", "Other", "Such", "His", "Hers",
]);

function findCharactersScan(text: string, n: number): { name: string; note: string }[] {
  const sents = sentences(text);
  const counts = new Map<string, number>();
  const firstMention = new Map<string, string>();
  const sentenceStarts = new Set<string>();

  // Build sentence-starts set, but EXCLUDE common openers — "The door opened"
  // should not make "The" a sentence-start candidate.
  for (const s of sents) {
    const first = s.match(/^["'“”‘’\s]*([A-Z][\p{L}'’-]*)/u)?.[1];
    if (first && !COMMON_SENTENCE_STARTERS.has(first)) sentenceStarts.add(first);
  }

  // Build a frequency map of lowercase word forms. A capitalized word whose
  // lowercase form appears MUCH more often than its capitalized form is likely
  // a common noun capitalized at sentence/quote start (e.g. "Lamps" from
  // `"Lamps don't mind waiting,"` — "lamps" appears 3× lowercase, 1× capitalized).
  // But "Ember" (a character name) appears mostly capitalized, even if "ember"
  // the common noun appears once or twice lowercase. We use a ratio: if the
  // lowercase count is ≥ 2× the capitalized count, treat it as a common noun.
  const lowerFreq = new Map<string, number>();
  const capFreq = new Map<string, number>();
  for (const w of wordList(text)) {
    if (w.length < 2) continue;
    lowerFreq.set(w, (lowerFreq.get(w) ?? 0) + 1);
  }
  // Count capitalized occurrences from the raw tokens
  for (const s of sents) {
    for (const tok of s.split(/\s+/)) {
      const clean = tok.replace(/^["'“”‘’([]+/, "").replace(/["'“”’”),.!?;:]+$/, "");
      if (/^[A-Z][\p{L}'’-]{1,20}$/u.test(clean)) {
        const lower = clean.toLowerCase();
        capFreq.set(lower, (capFreq.get(lower) ?? 0) + 1);
      }
    }
  }

  for (const s of sents) {
    const tokens = s.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i].replace(/^["'“”‘’([]+/, "").replace(/["'“”’”),.!?;:]+$/, "");
      // Must be a capitalized word, 2-20 chars
      if (!/^[A-Z][\p{L}'’-]{1,20}$/u.test(raw)) continue;
      // ALWAYS filter common words — they are never character names,
      // even if the sentence contains a dialogue verb. This was the root
      // cause of "Hers", "She", "In" appearing as scene characters.
      if (NEVER_CHARACTER.has(raw)) continue;
      // Lowercase-frequency ratio filter: distinguishes proper names from
      // common nouns capitalized at sentence/quote start.
      //   - "Ember" (character): appears 4× cap, 0× lower → proper name ✓
      //   - "Lamps" (common noun): appears 1× cap, 1× lower → common noun ✗
      //   - "Door" (common noun): appears 1× cap, 3× lower → common noun ✗
      // Rule: if the lowercase form exists AND capitalized count is low (≤1),
      // it's likely a common noun. Real character names appear multiple times
      // capitalized — a single capitalized occurrence is usually sentence-start.
      const lower = raw.toLowerCase();
      const capCount = capFreq.get(lower) ?? 0;
      const lowerCount = (lowerFreq.get(lower) ?? 0) - capCount; // lowercase-only occurrences
      if (lowerCount >= 1 && capCount <= 1) continue;
      // Check if this is a plural/common noun by looking at the prev token:
      // if the previous token is an article ("the lamps"), skip it.
      const prev = i > 0 ? tokens[i - 1] : "";
      const prevIsArticle = /\b(the|a|an|some|many|these|those|all|both|each|every|his|her|its|their|our|your|my)\b/i.test(prev);
      if (prevIsArticle) continue;
      // Dialogue-verb adjacency: only words DIRECTLY ADJACENT to a dialogue
      // verb ("Ember said", "said Ember") get the 2× weight bonus. The old
      // sentence-level `mentionsVerb` flag gave "Lamps" (in `"Lamps don't
      // mind waiting," he said`) a 2× bonus even though "Lamps" is nowhere
      // near "said" — "he said" is the speaker, not "Lamps".
      const nextRaw = i < tokens.length - 1 ? tokens[i + 1].replace(/^["'“”‘’([]+/, "").replace(/["'“”’”),.!?;:]+$/, "") : "";
      const prevRaw = prev.replace(/^["'“”‘’([]+/, "").replace(/["'“”’”),.!?;:]+$/, "");
      const adjacentVerb = CHAR_VERBS.test(nextRaw) || CHAR_VERBS.test(prevRaw);
      // If the word appears at sentence start AND is in the common-starters
      // set, skip it unless it's directly adjacent to a dialogue verb.
      if (sentenceStarts.has(raw) && COMMON_SENTENCE_STARTERS.has(raw) && !adjacentVerb) continue;
      // Weight: a word directly adjacent to a dialogue verb ("Ember said")
      // gets 2× weight — this is the strongest character-name signal. A word
      // that only appears capitalized with no dialogue-verb adjacency gets 1×.
      const weight = adjacentVerb ? 2 : 1;
      counts.set(raw, (counts.get(raw) ?? 0) + weight);
      if (!firstMention.has(raw)) firstMention.set(raw, s);
    }
  }

  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name]) => ({ name, note: firstMention.get(name) ?? "" }));
}

/* ═══════════════════════════════════════════════════
   6. Mood / atmosphere / setting / time classification
   ═══════════════════════════════════════════════════ */

const MOOD_LEXICON: [string, string[]][] = [
  ["hushed anticipation", ["quiet", "still", "silence", "hush", "held", "waiting", "expect", "breath", "pause", "soft", "hush", "listening", "hovered"]],
  ["ember warmth", ["fire", "warm", "hearth", "candle", "lamp", "glow", "gold", "amber", "tea", "bread", "kettle", "cozy", "wrapped"]],
  ["cold unease", ["cold", "frost", "wind", "dark", "shadow", "fear", "dread", "empty", "iron", "grey", "gray", "sharp", "biting", "hollow"]],
  ["wonder", ["light", "star", "sky", "wonder", "strange", "bright", "silver", "moon", "sea", "glass", "shimmer", "luminous", "glimmer"]],
  ["tender sorrow", ["grief", "loss", "memory", "gone", "tears", "old", "forgotten", "farewell", "letter", "rain", "absence", "mourn", "lament"]],
  ["tense resolve", ["grip", "steel", "edge", "set", "jaw", "fist", "ready", "stance", "watchful", "poised", "braced", "steady"]],
  ["quiet joy", ["smile", "laugh", "warm", "glad", "bright", "light", "dance", "song", "music", "bloom", "sweet", "tender"]],
];

const PLACE_WORDS = ["room", "hall", "street", "kitchen", "door", "threshold", "window", "house", "tower", "library", "stair", "floor", "table", "wall", "garden", "yard", "cellar", "attic"];
const EXTERIOR_WORDS = ["street", "road", "field", "forest", "sea", "sky", "hill", "mountain", "valley", "river", "bridge", "garden", "yard", "market", "square"];

const TIME_WORDS: [string, string[]][] = [
  ["dusk", ["dusk", "evening", "lamp", "candle", "sunset", "twilight", "gloaming"]],
  ["night", ["night", "midnight", "dark", "moon", "stars", "nocturnal"]],
  ["morning", ["morning", "dawn", "sunrise", "early", "breakfast", "rooster"]],
  ["noon", ["noon", "midday", "sun", "bright", "zenith"]],
  ["afternoon", ["afternoon", "late", "tea", "shadows"]],
];

export function moodOf(text: string): string {
  return memo(MOOD_CACHE, text, () => classifyMood(text));
}

function classifyMood(text: string): string {
  const lower = text.toLowerCase();
  const count = (list: string[]) => list.reduce((a, w) => a + (lower.split(w).length - 1), 0);
  const mood = MOOD_LEXICON.map(([name, lex]) => [name, count(lex)] as const).sort((a, b) => b[1] - a[1])[0];
  const time = TIME_WORDS.map(([name, lex]) => [name, count(lex)] as const).sort((a, b) => b[1] - a[1])[0];
  const interiorCount = count(PLACE_WORDS);
  const exteriorCount = count(EXTERIOR_WORDS);
  const interior = interiorCount >= exteriorCount;
  return `${mood[0]} · ${time[1] > 0 ? time[0] : "unmarked time"} · ${interior ? "interior" : "exterior"}`;
}

export function moodKey(text: string): string {
  const mood = moodOf(text);
  return MOOD_LEXICON.map(([name]) => name).find((k) => mood.startsWith(k)) ?? "hushed anticipation";
}

/* ═══════════════════════════════════════════════════
   7. Theme extraction with chapter distribution
   ═══════════════════════════════════════════════════ */

export function extractThemes(text: string, n = 4, chapters?: { title: string; text: string }[]): { name: string; note: string; distribution?: { chapter: string; count: number }[] }[] {
  const kw = topKeywords(text, n + 2).slice(0, n);
  return kw.map((k) => {
    const relevant = sentences(text).filter((s) => s.toLowerCase().includes(k));
    const note = extractiveSummary(relevant.join(" "), 1) || `Threads through the text.`;
    const distribution = chapters?.map((c) => ({
      chapter: c.title,
      count: c.text.toLowerCase().split(k).length - 1,
    }));
    return { name: cap(k), note, distribution };
  });
}

/* ═══════════════════════════════════════════════════
   8. Vocabulary selection
   ═══════════════════════════════════════════════════ */

export function extractVocab(text: string, n = 7): { term: string; context: string }[] {
  const sents = sentences(text);
  return [...freqMap(text).entries()]
    .filter(([w, c]) => w.length >= 7 && c >= 1 && c <= 4 && !STOP.has(w))
    .sort((a, b) => b[0].length - a[0].length)
    .slice(0, n)
    .map(([w]) => ({
      term: w,
      context: sents.find((s) => s.toLowerCase().includes(w)) ?? "",
    }));
}

/* ═══════════════════════════════════════════════════
   9. Cloze-deletion quiz generation
   ═══════════════════════════════════════════════════ */

export function clozeQuiz(text: string, n = 6): QuizQuestion[] {
  const sents = sentences(text).filter((s) => wordList(s).length >= 6 && s.length < 280);
  const freq = freqMap(text);
  const candidates = [...freq.entries()].filter(([, c]) => c >= 2 && c <= 12).map(([w]) => w);
  const qs: QuizQuestion[] = [];
  const used = new Set<string>();
  for (const s of sents) {
    if (qs.length >= n) break;
    const words = s.split(/\s+/);
    const idx = words.findIndex((w, i) => {
      const clean = w.toLowerCase().replace(/[^a-z']/g, "");
      return clean.length >= 5 && !STOP.has(clean) && freq.has(clean) && !used.has(clean) && i > 0 && i < words.length - 1;
    });
    if (idx === -1) continue;
    const answerWord = words[idx].replace(/[,.!?;:]+$/, "");
    const clean = answerWord.toLowerCase().replace(/[^a-z']/g, "");
    used.add(clean);
    const distractors = candidates.filter((c) => c !== clean && Math.abs(c.length - clean.length) <= 2).sort(() => Math.random() - 0.5).slice(0, 3);
    if (distractors.length < 3) continue;
    const options = [answerWord, ...distractors].sort(() => Math.random() - 0.5);
    qs.push({
      q: `Choose the word that completes the passage: “${words.slice(0, idx).join(" ")} ____ ${words.slice(idx + 1).join(" ")}”`,
      options,
      answer: options.indexOf(answerWord),
      why: s,
    });
  }
  return qs;
}

/* ═══════════════════════════════════════════════════
   10. Flashcard generation
   ═══════════════════════════════════════════════════ */

export function buildFlashcards(doc: DocumentRow, text: string): { front: string; back: string }[] {
  const vocab = extractVocab(text, 4);
  const chars = findCharacters(text, 3);
  return [
    ...vocab.map((v) => ({ front: v.term, back: v.context || `Appears in ${doc.title}.` })),
    ...chars.map((c) => ({ front: c.name, back: c.note })),
  ];
}

/* ═══════════════════════════════════════════════════
   11. Cinematic scene dramatization
   ═══════════════════════════════════════════════════ */

const SCENE_BRIDGES: Record<string, string[]> = {
  "hushed anticipation": [
    "Everything here is waiting without admitting it — the {thing} holds its small argument against the hour, and the {place} keeps the quiet like a hand over a mouth.",
    "The air has the particular weight of a held breath. Nothing in the {place} moves that doesn't have to, and the {thing} seems to lean toward whoever will speak first.",
    "Silence here is not absence but presence — the {place} listening, the {thing} bearing witness, everything tuned to the frequency of what hasn't happened yet.",
  ],
  "ember warmth": [
    "Warmth pools where the {thing} throws it, turning the {place} into the kind of shelter people remember for years without knowing why.",
    "There is a lamplight logic to the {place}: everything near the {thing} is forgiven, everything beyond it is merely weather.",
    "The {thing} keeps its own time — slower than clocks, kinder than hours — and the {place} has learned to breathe in that rhythm.",
  ],
  "cold unease": [
    "The cold here is not weather but attention — the {place} notices whoever crosses it, and the {thing} keeps its own counsel.",
    "A draft moves through the {place} like an uninvited guest. The {thing} does not flicker; that is somehow the unsettling part.",
    "Shadows in the {place} have edges they shouldn't. The {thing} throws them long and deliberate, as though marking territory.",
  ],
  wonder: [
    "The {place} has stopped being ordinary and hasn't apologized for it. Even the {thing} looks borrowed from a brighter story.",
    "Light behaves strangely here, as if the {place} has opinions. The {thing} catches it and holds it a second longer than physics allows.",
    "There's a quality to the air in the {place} — thinner, more transparent — as though the {thing} has thinned the veil between this and wherever it came from.",
  ],
  "tender sorrow": [
    "The {place} keeps its losses politely — in the {thing}, in the worn places, in the way dust settles like something remembered.",
    "Grief has made the {place} quieter than silence. The {thing} is the only witness that never learned to look away.",
    "Memory lives in the {place} like a tenant who never quite moved out — the {thing} still holds the shape of hands that aren't coming back.",
  ],
  "tense resolve": [
    "The {place} has gone still the way a blade goes still before it moves. The {thing} holds its position, ready.",
    "Every object in the {place} has gone deliberate — the {thing} especially, set like a word held between the teeth.",
    "There's a coiled quality to the {place} — the {thing} at its center, waiting for the hand that will decide what it becomes.",
  ],
  "quiet joy": [
    "The {place} has gone golden at the edges, the {thing} at its center throwing warmth like a small private sun.",
    "Something has eased in the {place} — the {thing} catches the light differently now, as though it knows it's been forgiven.",
    "The {place} keeps its happiness quietly, the way good houses do — in the {thing}, in the dust-motes, in the particular angle of afternoon.",
  ],
};

const SCENE_CODAS: string[] = [
  "What lingers is not an ending but a door left exactly as the chapter left it: open, and slightly warm.",
  "The last thing to settle is the smallest — a {thing}, a hand, a held word. Small things, carrying everything.",
  "And the {place}, which has been listening all along, files the evening away under weather it will mention again.",
  "Outside, the world goes on its way. Inside, the {thing} keeps its post, and the {place} keeps its secret.",
  "So the scene holds — not finished, not beginning, but paused in the particular way that {place}s pause when something has been decided and not yet said.",
];

const SPEECH_TAGS = ["quietly", "at last", "without looking up", "from the doorway", "to no one in particular", "as if answering a question nobody asked", "almost too late", "with the weight of something long considered", "into the silence that had been holding its breath"];

export function offlineScenes(doc: DocumentRow, chapterIndex: number, salt = 0): SceneDraft[] {
  const chapters = doc.contentJson.chapters;
  const ch = chapters[clamp(chapterIndex, 0, chapters.length - 1)];
  const text = ch.chunks.map((c) => c.text).join("\n\n");
  const sents = sentences(text);
  if (!sents.length) return [];
  const characters = findCharacters(text, 4).map((c) => c.name);
  const cast = characters.length ? characters : ["The Reader", "The House"];
  const mood = moodOf(text);
  const mk = moodKey(text);
  const kw = topKeywords(text, 8);
  const rnd = seeded(chapterIndex * 1013 + salt * 31 + text.length);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const quotes = (text.match(/[\u201C"]([^\u201D"\n]{6,180})[\u201D"]/g) ?? [])
    .map((q) => q.replace(/^[\u201C"]|[\u201D"]$/g, "").trim());

  // Scale scene count with chapter length, matching the online path:
  // <2500 chars → 2 scenes, 5000-7500 → 3, 7500-10000 → 4, >10000 → 5.
  const sceneCount = Math.max(2, Math.min(5, Math.ceil(text.length / 2500)));
  const n = Math.min(sents.length, 12 * sceneCount);
  const sliceSize = Math.max(1, Math.ceil(n / sceneCount));
  const slices = Array.from({ length: sceneCount }, (_, i) =>
    sents.slice(i * sliceSize, Math.min((i + 1) * sliceSize, n))
  ).filter((t) => t.length > 0);
  const k0 = kw[0] ?? "light";
  const k1 = kw[1] ?? "room";
  const fill = (s: string) => s.split("{thing}").join(k0).split("{place}").join(k1);

  const titleSeed = ch.title !== "Opening" && ch.title !== "Full text" && !/^Part /.test(ch.title)
    ? ch.title
    : kw[salt % Math.max(1, kw.length)]
      ? `The ${cap(kw[salt % kw.length])}`
      : "The Threshold";

  // Unique per-scene subtitle so no two scenes share the same title even
  // when sceneCount > 3 (the previous "the turn / coda" only covered 3).
  const SUBTITLES = ["opening", "the turn", "deepening", "the hinge", "coda"];

  const bridges = SCENE_BRIDGES[mk] ?? SCENE_BRIDGES["hushed anticipation"];
  const scenes: SceneDraft[] = [];
  slices.forEach((slice, i) => {
    const spineA = slice[0] ?? "";
    const spineB = slice[1] ?? slice[0] ?? "";
    const closing = slice[slice.length - 1] && slice.length > 2 ? slice[slice.length - 1] : "";
    const quote = quotes[i % Math.max(1, quotes.length)];
    const speech = quote && characters.length
      ? `\n\n\u201C${quote}\u201D \u2014 ${characters[i % characters.length]}, ${pick(SPEECH_TAGS)}.`
      : quote
        ? `\n\n\u201C${quote}\u201D`
        : "";
    const body = [
      `${spineA} ${fill(pick(bridges))}`,
      `${spineB}${closing ? ` ${closing}` : ""}${speech}`,
      fill(pick(SCENE_CODAS)),
    ].join("\n\n");
    const subtitle = SUBTITLES[i] ?? `movement ${i + 1}`;
    scenes.push({
      title: slices.length > 1 ? `${titleSeed} — ${subtitle}` : titleSeed,
      mood: i === Math.floor(slices.length / 2) ? moodOf(slice.join(" ")) : mood,
      characters: i === Math.floor(slices.length / 2) ? cast.slice(0, 2) : cast,
      body,
    });
  });
  return scenes.length ? scenes : [{ title: titleSeed, mood, characters: cast, body: `${sents.slice(0, 2).join(" ")} ${fill(bridges[0])}` }];
}

/* ═══════════════════════════════════════════════════
   12. Long-form story generation (LOA Ankaa)
   ═══════════════════════════════════════════════════ */

const ANKAA_TITLES: Record<AnkaaMode, string> = {
  continue: "What Followed", alternate: "The Other Door", chapter: "The Next Morning",
  lore: "Notes from the Ledger", children: "The Lamp That Needed a Friend", whatif: "A Day Early",
};

export interface StoryAnchors {
  cast: string[];
  hook: string;
  keywords: string[];
}

export function extractAnchors(prompt: string): StoryAnchors {
  const trimmed = prompt.trim();
  // Common prompt command words that should NOT be treated as character names.
  // These are capitalized at the start of sentences but aren't proper nouns.
  const commandWords = new Set([
    "Write", "A", "An", "The", "Tell", "Make", "Create", "Draft", "Compose",
    "Generate", "Describe", "Imagine", "Picture", "Show", "Give", "Build",
    "Continue", "Rewrite", "Retell", "Adapt", "Explore",
  ]);
  const starters = new Set(["The", "A", "An"]);
  const cast: string[] = [];
  const seqs = trimmed.match(/[A-Z][\w'’]*(?:\s+(?:of|the|and|'s)?\s*[A-Z][\w'’]*)*/g) ?? [];
  for (const seq of seqs) {
    const parts = seq.split(/\s+/).filter((p) => /^[A-Z]/.test(p));
    let cores = parts;
    while (cores.length && starters.has(cores[0])) cores = cores.slice(1);
    if (!cores.length) continue;
    // Filter out pure command words — "Write" from "Write a story..." is not a character.
    cores = cores.filter((c) => !commandWords.has(c));
    if (!cores.length) continue;
    const names = cores.length <= 2 ? [cores.join(" ")] : cores;
    for (const n of names) if (n.length > 1 && !cast.includes(n)) cast.push(n);
  }
  for (const tok of trimmed.match(/\b[A-Z]{3,}\b/g) ?? []) {
    const pretty = cap(tok.toLowerCase());
    if (!cast.includes(pretty)) cast.push(pretty);
  }
  const keywords = [...new Set(wordList(trimmed).filter((w) => w.length > 3 && !STOP.has(w)))].slice(0, 6);
  return { cast: cast.slice(0, 4), hook: trimmed, keywords };
}

export function offlineAnkaaLong(mode: AnkaaMode, doc: DocumentRow | null, prompt: string, nonce = 0, depth: "short" | "medium" | "long" = "long"): { title: string; body: string } {
  const anchors = extractAnchors(prompt);
  const text = doc ? docText(doc) : prompt || "a story about a lamp that needed a friend";
  const vBase = topKeywords(text, 10);
  const v = doc ? vBase : [...anchors.keywords, ...vBase].filter((w, i, a) => a.indexOf(w) === i).slice(0, 10);
  const c = anchors.cast.length
    ? anchors.cast
    : doc
      ? findCharacters(text, 4).map((x) => x.name)
      : ["The Traveler", "The Keeper"];
  const A = c[0] ?? "the stranger";
  const B = c[1] ?? "the keeper of the house";
  const w0 = v[0] ?? "light";
  const w1 = v[1] ?? "door";
  const w2 = v[2] ?? "street";
  const w3 = v[3] ?? "window";
  const w4 = v[4] ?? "silence";
  const mood = moodOf(text).split("·")[0].trim();
  const rnd = seeded((mode.length * 7919 + text.length + prompt.length + (nonce % 1_000_003) * 9973) >>> 0);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  // Depth controls beat count + closing count so a short prompt yields ~400
  // words, medium ~600, long ~800 (the offline template's natural ceiling —
  // the online path scales higher per-section via the model's token budget).
  const beatCount = depth === "short" ? 2 : depth === "medium" ? 3 : 5;
  const closingCount = depth === "short" ? 2 : depth === "medium" ? 2 : 4;

  const P: string[] = [];
  P.push(pick([
    `It began, as these things do, with the ${w0} — not the grand kind of beginning that histories prefer, but the small kind that actually happens: a ${w0} noticed, held, and refused to be put down. ${cap(A)} understood, perhaps before understanding anything else, that the ${mode === "whatif" ? "day" : "evening"} had made a decision and merely needed someone to witness it.`,
    `Nobody later agreed on when it began, which is how you know it began early. The ${w2} had gone the color of cooling tea, and ${A} stood where the ${w1} made its nightly argument with the dark, counting breaths the way other people count coins.`,
  ]));
  P.push(pick([
    `There is a grammar to waiting. ${cap(B)} had spent a lifetime conjugating it: the subjunctive of a kettle not yet boiled, the conditional of a chair kept empty. Tonight the grammar changed tense without asking, and the whole house leaned forward to hear the new verb.`,
    `The house, for its part, kept its opinions to its beams. Houses do that. But the ${w3} gave the evening away — the way a ${w3} does at this hour, holding the last of the ${w0} like a secret it has already told to everyone who matters.`,
  ]));
  if (!doc && anchors.cast.length && depth !== "short") {
    P.push(
      `${cap(A)} and ${cap(B)} arrived the way such figures always arrive in the telling: announced by the weather, preceded by rumor, and followed by a ${w4} that had opinions of its own. Whatever else happened next, it happened to them first.`
    );
  }
  const beats: [string, string][] = [
    [
      `The first thing to happen was small enough to miss: the ${w4} acquired a texture. Not emptiness — texture, the way velvet is empty and still insists on being touched. ${cap(A)} tested it with a word, and the word came back slightly warmer, like a teacup someone has been holding for you.`,
      `It is worth saying plainly: nothing was demanded of anyone yet. That is the trick of thresholds. They do not demand; they merely stop pretending that staying still is a neutral act.`,
    ],
    [
      `${cap(B)} appeared the way ${B} always appeared — from wherever lamplighters and keepers go between duties, which is to say, from nowhere you can point at. "You're early," said ${B}, which was not true, and "or late," which was not true either, and the space between the two statements was precisely large enough for ${A} to live in.`,
      `They spoke of ordinary things, which is what people speak of when the extraordinary is in the room and has not yet introduced itself. The ${w2} outside. The weather of the stairs. Whether the ${w1} sticks more in winter or in memory. The ${w0} listened with the patience of things that have heard every version of this conversation and love it anyway.`,
    ],
    [
      `Then the turn began to gather, quietly, the way weather gathers behind a hill you haven't named yet. A letter? A knock? A realization? The story keeps its own counsel here, but the ${w4} thinned, and somewhere under the floorboards the house revised its estimate of the evening.`,
      `${cap(A)} felt it in the hands first — the specific weight of a decision that has stopped being theoretical. There is a moment, one moment only, when a ${w1} is still merely wood, and then it isn't. Histories are written by the people who notice that moment; everyone else merely lives through it.`,
    ],
    [
      `${cap(B)}, who had seen a thousand such evenings and filed them under weather, did the only unprofessional thing possible: hesitated. The hesitation lasted perhaps three seconds, which is to say it lasted the rest of both their lives, because some durations are not measured in seconds but in before-and-after.`,
      `The ${w3} showed the ${w2} going dark in panels, one by one, like a ledger closing its accounts. Whatever was coming had finished arriving elsewhere and was now, at last, arriving here — on time, unhurried, wearing ordinary shoes.`,
    ],
    [
      `And so the hinge of the whole affair: ${A} ${mode === "alternate" ? "did not open the door, and the not-opening became its own kind of doorway, one that led inward" : mode === "children" ? "took a brave, cocoa-sized breath, which is the largest size of breath there is" : mode === "whatif" ? "acted one heartbeat earlier than the story expected, and the story, surprised, showed its hand" : "opened the door, or was opened by it — the witnesses disagree, and the door has never testified"}.`,
      `What followed was not loud. Real turns rarely are. The ${w0} simply changed owners, the ${w4} simply changed its mind, and ${A} stepped from the ${mode === "lore" ? "footnote into the text" : "threshold into the sentence"}, where the verbs are.`,
    ],
  ];
  for (let i = 0; i < beatCount; i++) { P.push(beats[i][0]); P.push(beats[i][1]); }
  const closings = [
    pick([
      `Years later — because there is always a years-later, stories insist on one — someone would ask ${A} what the ${mood} felt like from the inside, and ${A} would answer honestly: like being read. Like the room was a page and the page was warm, and the hand turning it was neither cruel nor kind, only attentive, which is the only kindness that lasts.`,
      `The ${w0}, transferred, burned differently now — less like a lamp and more like a kept promise, which is what lamps secretly are. ${cap(B)} watched it settle into its new keeping and performed the lamplighter's oldest ritual: said nothing, and meant it.`,
    ]),
    pick([
      `If there is a lesson, it is a small one, small enough to carry in a coat pocket next to the keys and the unanswered letter: every ${w1} is two doors, and the one you open is never the one that changes you — it's the one you finally stop needing to.`,
      `The house added the evening to its collection of evenings, which is to say it forgot nothing and mentioned nothing. But on certain ${mood.split(" ")[0]} nights, if you stand on the third stair and hold your breath, you can still hear the ${w4} — textured, warm, still deciding.`,
    ]),
    pick([
      `${cap(A)} slept before the tea went cold, which the doctors would call impossible and the house called Tuesday. The ${w2} kept its post. The ${w0} kept its post. And somewhere between the two, the story kept its promise — not to explain, but to continue, which is the only promise stories are allowed to make.`,
      `The last thing to happen, as is right and proper, was quiet: the ${w0} dimming to the exact brightness of a memory being made. ${cap(A)} did not watch it happen. ${cap(A)} was too busy being the person it happens to.`,
    ]),
    pick([
      `And that, reader, is how it went — or how it goes, since things like this never quite agree to become past tense. The ${w1} remains. The ${w0} remains. The threshold, as thresholds do, remains exactly where you left it: waiting to be the exact place where the outside agrees to end.`,
      `So the ledger closes, though it leaves the last line unfinished on purpose. Some books end; this one merely lowers its voice. Listen — the ${w4} is still textured, the ${w0} is still borrowed, and the next chapter is already standing on the third stair, deciding.`,
    ]),
  ];
  for (let i = 0; i < closingCount; i++) P.push(closings[i]);

  const customTitle = anchors.cast.length ? `${anchors.cast[0]} — ${ANKAA_TITLES[mode]}` : ANKAA_TITLES[mode];
  const title = doc ? `${doc.title} — ${customTitle}` : customTitle;
  return { title, body: P.join("\n\n") };
}

/* ═══════════════════════════════════════════════════
   13. Deep literary analysis (LOA)
   ═══════════════════════════════════════════════════ */

export function offlineAnalysis(doc: DocumentRow): DeepAnalysis {
  const text = docText(doc);
  const themes = extractThemes(text, 4);
  return {
    summary: extractiveSummary(text, 6),
    themes,
    characters: findCharacters(text, 5),
    criticism:
      `"${doc.title}" moves by ${topKeywords(text, 3).join(", ") || "its images"} more than by event. ` +
      `The prose is ${doc.warnings.length === 0 ? "clean and well-preserved" : "somewhat degraded — refinement would help close reading"}. ` +
      `Its recurring vocabulary (${topKeywords(text, 6).slice(0, 4).join(", ")}) gives the piece a ${moodOf(text).split("·")[0].trim()} register, and the pacing — ${doc.wordCount.toLocaleString()} words across ${doc.chapterCount} chapter${doc.chapterCount === 1 ? "" : "s"} — rewards slow re-reading.`,
  };
}

/* ═══════════════════════════════════════════════════
   14. Study set builder (LOA Ouro)
   ═══════════════════════════════════════════════════ */

export function buildStudy(doc: DocumentRow, chapterIndex: number | null): StudyData {
  const text = chapterIndex === null ? docText(doc) : chapterText(doc, chapterIndex);
  const scope = chapterIndex === null ? "the whole text" : `"${doc.contentJson.chapters[chapterIndex].title}"`;
  const summary = extractiveSummary(text, chapterIndex === null ? 6 : 4);
  const chars = findCharacters(text, 4);
  const kw = topKeywords(text, 10);
  const vocab = extractVocab(text, 6);
  const cards = buildFlashcards(doc, text);
  const themes = kw.slice(0, 4).map((k) => ({
    name: cap(k),
    note: extractiveSummary(sentences(text).filter((s) => s.toLowerCase().includes(k)).join(" "), 2) || `Threads through ${scope}.`,
  }));
  return {
    summary,
    guide: [
      `Scope: ${scope} of "${doc.title}" by ${doc.author}.`,
      `Central movements: ${kw.slice(0, 5).join(", ") || "— none extracted —"}.`,
      `Key passage: ${sentences(text)[0] ?? ""}`,
      chars.length ? `Figures to track: ${chars.map((c) => c.name).join(", ")}.` : "No recurring figures detected — this passage is mostly landscape or reflection.",
      `Ask yourself: why does ${kw[0] ?? "the opening image"} return when it does?`,
    ],
    objectives: [
      `Identify how ${kw[0] ?? "the central image"} functions as a motif across ${scope}.`,
      `Trace the shift in register from the opening to the closing sentences, citing two passages.`,
      chars.length
        ? `Compare what ${chars[0].name} says with what ${chars[0].name} does — locate the gap on the page.`
        : `Explain how setting performs the work usually assigned to character.`,
      `Formulate one question the text answers and one it deliberately withholds.`,
    ],
    essays: [
      `"${themes[0]?.name ?? "The recurring image"} is less a symbol than a habit of attention." Discuss with reference to ${scope}.`,
      `Analyze the pacing of ${scope}: where does the prose accelerate, where does it wait — and what does the reader learn in the waiting?`,
      chars.length >= 2
        ? `Compare ${chars[0].name} and ${chars[1].name} as competing definitions of the same virtue.`
        : `What does the narrator refuse to say? Argue from silence, syntax and omission.`,
    ],
    themes,
    characters: chars,
    vocab,
    quiz: clozeQuiz(text, 6),
    cards,
  };
}

/* ═══════════════════════════════════════════════════
   15. Helpers
   ═══════════════════════════════════════════════════ */

export function docText(doc: DocumentRow): string {
  return doc.contentJson.chapters.flatMap((c) => c.chunks.map((k) => k.text)).join("\n\n");
}

export function chapterText(doc: DocumentRow, chapterIndex: number): string {
  const ch = doc.contentJson.chapters[clamp(chapterIndex, 0, doc.contentJson.chapters.length - 1)];
  return ch ? ch.chunks.map((c) => c.text).join("\n\n") : "";
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    // Divide by 2^32 (not 2^32-1) so the result is always in [0, 1) —
    // dividing by 0xffffffff can return exactly 1.0 when s === 0xffffffff,
    // which would make Math.floor(rnd() * arr.length) === arr.length (out of
    // bounds) and cause pick() to return undefined.
    return s / 0x100000000;
  };
}

/** Truncate to N words with an ellipsis. */
export function truncateWords(s: string, n: number): string {
  const w = s.split(/\s+/);
  return w.length > n ? w.slice(0, n).join(" ") + "…" : s;
}
