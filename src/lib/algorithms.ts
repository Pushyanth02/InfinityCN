/**
 * algorithms.ts — InfinityCN Core NLP & Analytics Engine
 *
 * All pure functions. No external dependencies.
 * Implements: TF-IDF, TextRank, AFINN Sentiment, Flesch-Kincaid,
 *             Vocabulary Richness (TTR/MTLD), Tension Scoring,
 *             Scene Segmentation, Named Entity Recognition,
 *             Pacing Analysis, Emotional Arc, Extractive Recap.
 */

// ═══════════════════════════════════════════════════════════
// 1. TOKENISATION
// ═══════════════════════════════════════════════════════════

/** Tokenise text into cleaned lowercase words */
export function tokenise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
}



/** Split text into sentences */
export function splitSentences(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
}

// ═══════════════════════════════════════════════════════════
// 4. AFINN-STYLE SENTIMENT ANALYSIS
// ═══════════════════════════════════════════════════════════

const SENTIMENT_LEXICON: Record<string, number> = {
    // Positive (+1 to +5)
    love: 3, amazing: 4, wonderful: 4, beautiful: 3, excellent: 4, great: 3,
    happy: 3, joy: 3, joyful: 3, good: 2, kind: 2, bright: 2, hope: 2,
    hopeful: 3, peace: 3, peaceful: 3, smile: 2, laugh: 2, warm: 2,
    gentle: 2, free: 2, freedom: 3, courage: 3, brave: 3, strong: 2,
    triumph: 4, victory: 4, succeed: 3, success: 3, safe: 2, saved: 3,
    alive: 2, light: 2, glow: 2, shine: 2, brilliant: 4, perfect: 3,
    trust: 2, true: 1, loyal: 2, care: 2, cherish: 3, proud: 2,
    hero: 3, protect: 2, rescue: 3, survive: 2, grateful: 3,

    // Negative (-1 to -5)
    hate: -3, terrible: -4, awful: -4, horrible: -4, bad: -2, dark: -1,
    evil: -4, kill: -4, killed: -4, murder: -5, death: -3, dead: -3,
    die: -3, dying: -3, blood: -2, pain: -3, suffer: -3, suffering: -3,
    cruel: -4, monster: -4, fear: -3, afraid: -3, terror: -4, horror: -4,
    scream: -2, cry: -2, sad: -2, grief: -3, loss: -2, lost: -2,
    alone: -2, betrayal: -4, betray: -4, lie: -2, liar: -3,
    weak: -2, fail: -2, failure: -3, broken: -3, destroy: -4, chaos: -3,
    war: -3, attack: -3, violence: -3, trapped: -3, helpless: -3,
    despair: -4, rage: -3, fury: -3, anger: -2, angry: -2,
    enemy: -2, danger: -3, threat: -3, corrupt: -3, bleed: -3, wound: -2,
    curse: -3, poison: -3, shadow: -2, cold: -1, bitter: -2,
    guilty: -3, shame: -3, regret: -3, misery: -4, disaster: -4,
};

/** Negation words that flip the sign */
const NEGATIONS = new Set(['not', 'no', 'never', 'neither', 'nor', "n't", 'without', 'hardly', 'barely']);

interface SentimentResult {
    score: number;          // Raw sum, normalised to [-1, 1]
    label: 'positive' | 'negative' | 'neutral';
    magnitude: number;      // Absolute intensity 0-1
    tokens: number;
}

export function analyseSentiment(text: string): SentimentResult {
    const words = tokenise(text);
    let score = 0;
    let magnitude = 0;
    let negated = false;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (NEGATIONS.has(w)) { negated = true; continue; }

        const val = SENTIMENT_LEXICON[w] ?? 0;
        if (val !== 0) {
            const adjusted = negated ? -val : val;
            score += adjusted;
            magnitude += Math.abs(adjusted);
            negated = false;
        } else {
            // Reset negation after 2 non-sentiment words
            if (!NEGATIONS.has(w)) negated = false;
        }
    }

    const normalised = words.length > 0
        ? Math.max(-1, Math.min(1, score / (words.length * 0.5)))
        : 0;
    const normMagnitude = words.length > 0
        ? Math.min(1, magnitude / (words.length * 0.3))
        : 0;

    return {
        score: parseFloat(normalised.toFixed(4)),
        label: normalised > 0.05 ? 'positive' : normalised < -0.05 ? 'negative' : 'neutral',
        magnitude: parseFloat(normMagnitude.toFixed(4)),
        tokens: words.length,
    };
}

/** Compute sentiment for every sentence in text. Returns arc of scores. */
// 5. TENSION SCORING (per panel)
// ═══════════════════════════════════════════════════════════

/**
 * Composite tension score [0, 1] combining:
 *  - Punctuation density (!, ?)
 *  - Sentiment negativity magnitude
 *  - Sentence brevity (short sentences feel tense)
 *  - All-caps word ratio (shouting/SFX)
 * Accepts optional pre-computed sentiment to avoid redundant work.
 */
export type { SentimentResult };

export function scoreTension(sentence: string, precomputedSentiment?: SentimentResult): number {
    const words = sentence.split(/\s+/);
    const wordCount = words.length;
    if (wordCount === 0) return 0;

    // Exclamation and question marks
    const punctScore = (sentence.match(/!/g)?.length ?? 0) * 0.2
        + (sentence.match(/\?/g)?.length ?? 0) * 0.1;

    // Capitalisation ratio (SFX, shouting)
    const allCapsWords = words.filter(w => w.length > 2 && w === w.toUpperCase()).length;
    const capsRatio = allCapsWords / wordCount;

    // Brevity bonus: terse sentences feel snappier
    const brevityBonus = wordCount < 6 ? 0.3 : wordCount < 12 ? 0.15 : 0;

    // Ellipsis = suspense
    const ellipsis = sentence.includes('...') ? 0.15 : 0;

    // Negative sentiment — use pre-computed if available
    const sentiment = precomputedSentiment ?? analyseSentiment(sentence);
    const negScore = sentiment.label === 'negative' ? sentiment.magnitude * 0.4 : 0;

    const raw = punctScore + capsRatio * 0.5 + brevityBonus + ellipsis + negScore;
    return Math.min(1, raw);
}

// ═══════════════════════════════════════════════════════════
// 10. NER — Named-Entity-Style Character Extraction
// ═══════════════════════════════════════════════════════════

const HONORIFICS = new Set([
    'mr', 'mrs', 'miss', 'ms', 'dr', 'prof', 'lord', 'lady',
    'sir', 'master', 'captain', 'general', 'king', 'queen', 'prince', 'princess',
]);

const GLOBAL_STOP_WORDS = new Set([
    'the', 'he', 'she', 'it', 'they', 'a', 'an', 'in', 'on', 'at', 'by', 'to', 'of', 'and',
    'but', 'or', 'not', 'so', 'as', 'if', 'up', 'no', 'go', 'my', 'we', 'you', 'his', 'her',
    'our', 'its', 'then', 'when', 'what', 'with', 'for', 'that', 'this', 'from', 'was',
    'had', 'are', 'can', 'all', 'now', 'still', 'just', 'here', 'there', 'could', 'would',
    'should', 'some', 'into', 'over', 'before', 'after', 'more', 'even', 'chapter', 'part',
    'volume', 'section', 'book', 'episode', 'page', 'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten', 'first', 'second', 'third', 'last', 'next',
    'back', 'down', 'said', 'asked', 'replied', 'answered', 'looked', 'turned', 'walked',
    'came', 'went', 'got', 'made', 'knew', 'thought', 'felt', 'heard', 'saw', 'told',
]);

export interface NamedCharacter {
    name: string;
    frequency: number;
    firstContext: string;
    sentiment: number;          // avg sentiment of sentences containing this character
    honorific?: string;
}

/**
 * Extract named characters from text using:
 * 1. Honorific prefix detection (Mr. Smith, Dr. Jones)
 * 2. Frequency filtering (must appear ≥ 2 times)
 * 3. TF-IDF weighting to rank by importance
 * 4. Sentiment association (avg sentiment of their sentences)
 */
export function extractCharacters(text: string, maxChars = 10): NamedCharacter[] {
    const sentences = splitSentences(text);
    const wordPattern = /\b([A-Z][a-z]{1,}(?:['-][A-Z][a-z]+)?)\b/g;

    interface Entry {
        count: number;
        contexts: string[];
        sentimentSum: number;
        honorific?: string;
    }
    const registry = new Map<string, Entry>();

    // Pre-compute per-sentence sentiment once (instead of per-character per-sentence)
    const sentimentScores = sentences.map(s => analyseSentiment(s).score);

    for (let si = 0; si < sentences.length; si++) {
        const sentence = sentences[si];
        const sentimentScore = sentimentScores[si];
        let match: RegExpExecArray | null;

        // Detect honorific-prefixed names first
        const honorificPat = /\b(Mr|Mrs|Miss|Ms|Dr|Prof|Lord|Lady|Sir|Master|Captain|General|King|Queen|Prince|Princess)\.?\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
        let hMatch: RegExpExecArray | null;
        const honorificNames = new Set<string>();
        while ((hMatch = honorificPat.exec(sentence)) !== null) {
            const title = hMatch[1].toLowerCase();
            const name = hMatch[2].trim();
            if (!registry.has(name)) {
                registry.set(name, { count: 0, contexts: [], sentimentSum: 0, honorific: title });
            }
            const entry = registry.get(name)!;
            entry.count++;
            if (entry.contexts.length < 2) entry.contexts.push(sentence);
            entry.sentimentSum += sentimentScore;
            honorificNames.add(name);
        }

        // General capitalized word extraction
        while ((match = wordPattern.exec(sentence)) !== null) {
            const name = match[1];
            const lower = name.toLowerCase();
            if (GLOBAL_STOP_WORDS.has(lower) || HONORIFICS.has(lower)) continue;
            if (name.length < 3) continue;
            // Skip if it starts a sentence (likely not a proper noun in that position)
            const trimmed = sentence.trimStart();
            if (trimmed.startsWith(name) && !honorificNames.has(name)) continue;

            if (!registry.has(name)) {
                registry.set(name, { count: 0, contexts: [], sentimentSum: 0 });
            }
            const entry = registry.get(name)!;
            entry.count++;
            if (entry.contexts.length < 2) entry.contexts.push(sentence);
            entry.sentimentSum += sentimentScore;
        }
    }

    return Array.from(registry.entries())
        .filter(([, v]) => v.count >= 2)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, maxChars)
        .map(([name, v]) => ({
            name,
            frequency: v.count,
            firstContext: v.contexts[0]
                ? (v.contexts[0].length > 120
                    ? v.contexts[0].substring(0, 120) + '…'
                    : v.contexts[0])
                : '',
            sentiment: v.count > 0
                ? parseFloat((v.sentimentSum / v.count).toFixed(3))
                : 0,
            ...(v.honorific && { honorific: v.honorific }),
        }));
}

// ═══════════════════════════════════════════════════════════
// 11. SCENE BOUNDARY DETECTION
// ═══════════════════════════════════════════════════════════

export interface SceneBoundary {
    startIndex: number;
    tensionDelta: number;
}

/**
 * Detect scene boundaries using tension shift analysis.
 * Compares adjacent sliding windows of the given size; a boundary
 * is detected where the absolute tension delta exceeds the threshold.
 */
export function detectSceneBoundaries(
    sentences: string[],
    windowSize = 4,
    threshold = 0.2
): SceneBoundary[] {
    if (sentences.length < windowSize * 2) return [];

    const tensions = sentences.map(s => scoreTension(s));
    const boundaries: SceneBoundary[] = [];

    const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    for (let i = windowSize; i <= sentences.length - windowSize; i++) {
        const before = avg(tensions.slice(i - windowSize, i));
        const after = avg(tensions.slice(i, i + windowSize));
        const delta = Math.abs(after - before);

        if (delta >= threshold) {
            // Avoid marking boundaries too close together
            if (boundaries.length === 0 || i - boundaries[boundaries.length - 1].startIndex >= windowSize) {
                boundaries.push({ startIndex: i, tensionDelta: parseFloat(delta.toFixed(4)) });
            }
        }
    }

    return boundaries;
}

// ═══════════════════════════════════════════════════════════
// 12. FLESCH-KINCAID READABILITY
// ═══════════════════════════════════════════════════════════

export interface ReadabilityResult {
    fleschKincaid: number;    // grade level (US school grade)
    readingEase: number;      // 0-100 (higher = easier)
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
    label: string;            // e.g. "College", "High School"
}

/** Estimate syllable count for an English word */
function countSyllables(word: string): number {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 2) return 1;
    let count = 0;
    const vowels = 'aeiouy';
    let prevVowel = false;
    for (const ch of w) {
        const isVowel = vowels.includes(ch);
        if (isVowel && !prevVowel) count++;
        prevVowel = isVowel;
    }
    // Silent 'e' at end
    if (w.endsWith('e') && count > 1) count--;
    return Math.max(1, count);
}

function readabilityLabel(ease: number): string {
    if (ease >= 90) return 'Very Easy';
    if (ease >= 70) return 'Easy';
    if (ease >= 50) return 'Moderate';
    if (ease >= 30) return 'Difficult';
    return 'Very Difficult';
}

export function computeReadability(text: string): ReadabilityResult {
    const sentences = splitSentences(text);
    const words = tokenise(text);
    if (sentences.length === 0 || words.length === 0) {
        return { fleschKincaid: 0, readingEase: 100, avgWordsPerSentence: 0, avgSyllablesPerWord: 0, label: 'N/A' };
    }

    const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = totalSyllables / words.length;

    // Flesch Reading Ease
    const readingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    const clampedEase = Math.max(0, Math.min(100, readingEase));

    // Flesch-Kincaid Grade Level
    const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    const clampedGrade = Math.max(0, Math.min(20, gradeLevel));

    return {
        fleschKincaid: parseFloat(clampedGrade.toFixed(1)),
        readingEase: parseFloat(clampedEase.toFixed(1)),
        avgWordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(1)),
        avgSyllablesPerWord: parseFloat(avgSyllablesPerWord.toFixed(2)),
        label: readabilityLabel(clampedEase),
    };
}

// ═══════════════════════════════════════════════════════════
// 13. TF-IDF KEYWORD EXTRACTION
// ═══════════════════════════════════════════════════════════

const KEYWORD_STOP_WORDS = new Set([
    ...GLOBAL_STOP_WORDS,
    'been', 'being', 'does', 'did', 'has', 'have', 'having', 'will', 'shall',
    'very', 'much', 'only', 'also', 'too', 'like', 'well', 'way', 'than',
    'each', 'every', 'such', 'both', 'own', 'same', 'about', 'through',
    'during', 'against', 'between', 'under', 'above', 'once', 'again',
    'other', 'any', 'many', 'few', 'most', 'along', 'around', 'upon',
    'while', 'until', 'since', 'though', 'because', 'enough', 'almost',
    'already', 'often', 'perhaps', 'really', 'quite', 'might', 'must',
    'shall', 'may', 'let', 'yet', 'seem', 'seemed', 'seems',
]);

export interface Keyword {
    word: string;
    score: number;   // TF-IDF score, normalised 0-1
    count: number;
}

/**
 * Extract top keywords using TF-IDF within paragraph-level documents.
 * Splits text into ~500 word paragraphs as pseudo-documents.
 */
export function extractKeywords(text: string, maxKeywords = 12): Keyword[] {
    const words = tokenise(text);
    if (words.length < 10) return [];

    // Build paragraph documents (~500 words each)
    const PARA_SIZE = 500;
    const docs: string[][] = [];
    for (let i = 0; i < words.length; i += PARA_SIZE) {
        docs.push(words.slice(i, i + PARA_SIZE));
    }
    if (docs.length < 2) docs.push(words.slice(Math.floor(words.length / 2)));

    // Term frequency across entire text
    const tf = new Map<string, number>();
    for (const w of words) {
        if (KEYWORD_STOP_WORDS.has(w) || w.length < 3) continue;
        tf.set(w, (tf.get(w) ?? 0) + 1);
    }

    // Document frequency (how many docs contain this word)
    const df = new Map<string, number>();
    for (const doc of docs) {
        const seen = new Set<string>();
        for (const w of doc) {
            if (!seen.has(w) && tf.has(w)) {
                df.set(w, (df.get(w) ?? 0) + 1);
                seen.add(w);
            }
        }
    }

    // Compute TF-IDF
    const numDocs = docs.length;
    const scores: { word: string; score: number; count: number }[] = [];
    for (const [word, freq] of tf) {
        const docFreq = df.get(word) ?? 1;
        const idf = Math.log((numDocs + 1) / (docFreq + 1)) + 1;
        const tfidf = (freq / words.length) * idf;
        scores.push({ word, score: tfidf, count: freq });
    }

    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, maxKeywords);
    const maxScore = top[0]?.score ?? 1;

    return top.map(s => ({
        word: s.word,
        score: parseFloat((s.score / maxScore).toFixed(3)),
        count: s.count,
    }));
}

// ═══════════════════════════════════════════════════════════
// 14. VOCABULARY RICHNESS (Type-Token Ratio)
// ═══════════════════════════════════════════════════════════

export interface VocabRichnessResult {
    ttr: number;              // Type-Token Ratio (0-1)
    uniqueWords: number;
    totalWords: number;
    label: string;            // "Rich", "Moderate", "Simple"
}

export function computeVocabRichness(text: string): VocabRichnessResult {
    const words = tokenise(text);
    if (words.length === 0) {
        return { ttr: 0, uniqueWords: 0, totalWords: 0, label: 'N/A' };
    }

    const unique = new Set(words);
    // Use root TTR (RTTR) to normalise for text length
    const rttr = unique.size / Math.sqrt(words.length);
    // Normalise to 0-1 range (typical RTTR range is 3-10)
    const normalised = Math.min(1, rttr / 10);

    const label = normalised > 0.6 ? 'Rich' : normalised > 0.35 ? 'Moderate' : 'Simple';

    return {
        ttr: parseFloat(normalised.toFixed(3)),
        uniqueWords: unique.size,
        totalWords: words.length,
        label,
    };
}

// ═══════════════════════════════════════════════════════════
// 15. PACING ANALYSIS
// ═══════════════════════════════════════════════════════════

export interface PacingResult {
    avgSentenceLength: number;
    shortSentenceRatio: number;  // % of sentences under 8 words
    longSentenceRatio: number;   // % of sentences over 25 words
    dialogueRatio: number;       // % of panels that are dialogue
    sceneCount: number;
    label: 'Fast' | 'Moderate' | 'Slow';
}

export function analysePacing(text: string, panels: Array<{ type: string }>): PacingResult {
    const sentences = splitSentences(text);
    if (sentences.length === 0) {
        return { avgSentenceLength: 0, shortSentenceRatio: 0, longSentenceRatio: 0, dialogueRatio: 0, sceneCount: 0, label: 'Moderate' };
    }

    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avg = lengths.reduce((s, v) => s + v, 0) / lengths.length;
    const short = lengths.filter(l => l < 8).length / lengths.length;
    const long = lengths.filter(l => l > 25).length / lengths.length;
    const dialogueCount = panels.filter(p => p.type === 'dialogue').length;
    const dialogueRatio = panels.length > 0 ? dialogueCount / panels.length : 0;
    const boundaries = detectSceneBoundaries(sentences, 4, 0.2);

    // Fast pacing = short sentences + high dialogue + many scene changes
    const pacingScore = short * 0.4 + dialogueRatio * 0.3 + Math.min(1, boundaries.length / 10) * 0.3;
    const label: PacingResult['label'] = pacingScore > 0.45 ? 'Fast' : pacingScore > 0.25 ? 'Moderate' : 'Slow';

    return {
        avgSentenceLength: parseFloat(avg.toFixed(1)),
        shortSentenceRatio: parseFloat(short.toFixed(3)),
        longSentenceRatio: parseFloat(long.toFixed(3)),
        dialogueRatio: parseFloat(dialogueRatio.toFixed(3)),
        sceneCount: boundaries.length + 1,
        label,
    };
}

// ═══════════════════════════════════════════════════════════
// 16. EMOTIONAL ARC (Sentiment over time)
// ═══════════════════════════════════════════════════════════

export interface EmotionalArcPoint {
    position: number;   // 0-100 percentage through the text
    sentiment: number;  // -1 to 1
    tension: number;    // 0 to 1
}

/**
 * Computes a smoothed emotional arc by sampling sentiment & tension
 * at regular intervals through the text. Returns ~20 data points.
 */
export function computeEmotionalArc(
    panels: Array<{ content: string; tension: number; sentiment: number }>
): EmotionalArcPoint[] {
    if (panels.length < 5) return [];

    const NUM_POINTS = Math.min(20, panels.length);
    const chunkSize = Math.floor(panels.length / NUM_POINTS);
    const points: EmotionalArcPoint[] = [];

    for (let i = 0; i < NUM_POINTS; i++) {
        const start = i * chunkSize;
        const end = i === NUM_POINTS - 1 ? panels.length : start + chunkSize;
        const chunk = panels.slice(start, end);

        const avgSentiment = chunk.reduce((s, p) => s + p.sentiment, 0) / chunk.length;
        const avgTension = chunk.reduce((s, p) => s + p.tension, 0) / chunk.length;

        points.push({
            position: parseFloat(((i / (NUM_POINTS - 1)) * 100).toFixed(1)),
            sentiment: parseFloat(avgSentiment.toFixed(3)),
            tension: parseFloat(avgTension.toFixed(3)),
        });
    }

    return points;
}

// ═══════════════════════════════════════════════════════════
// 17. EXTRACTIVE RECAP (TextRank-inspired)
// ═══════════════════════════════════════════════════════════

/**
 * Generate an extractive summary by scoring sentences on:
 *  1. Position (first & last sentences score higher)
 *  2. Keyword overlap with top TF-IDF terms
 *  3. Sentence length (prefer medium-length)
 *  4. Named entity presence
 * Returns the top 3-5 sentences joined as a recap paragraph.
 */
export function generateExtractiveRecap(text: string, maxSentences = 4): string {
    const sentences = splitSentences(text);
    if (sentences.length < 5) return sentences.join(' ');

    const keywords = new Set(extractKeywords(text, 20).map(k => k.word));
    const charNames = new Set(extractCharacters(text, 8).map(c => c.name.toLowerCase()));

    const scored = sentences.map((sentence, idx) => {
        const words = tokenise(sentence);
        let score = 0;

        // Position bonus: first 10% and last 10% get a boost
        const position = idx / sentences.length;
        if (position < 0.1) score += 0.3;
        else if (position > 0.9) score += 0.2;

        // Keyword overlap
        const keywordHits = words.filter(w => keywords.has(w)).length;
        score += Math.min(0.5, keywordHits * 0.08);

        // Named entity presence
        const entityHits = words.filter(w => charNames.has(w)).length;
        score += Math.min(0.3, entityHits * 0.15);

        // Prefer medium sentences (10-30 words)
        if (words.length >= 10 && words.length <= 30) score += 0.15;
        else if (words.length < 5 || words.length > 50) score -= 0.1;

        // Informational punctuation
        if (sentence.includes(':') || sentence.includes('—')) score += 0.05;

        return { sentence, score, idx };
    });

    scored.sort((a, b) => b.score - a.score);

    // Pick top sentences but maintain original order
    const selected = scored
        .slice(0, maxSentences)
        .sort((a, b) => a.idx - b.idx)
        .map(s => s.sentence);

    return selected.join(' ');
}

// ═══════════════════════════════════════════════════════════
// ── DIALOGUE ATTRIBUTION ANALYSIS ──────────────────────────
// ═══════════════════════════════════════════════════════════

export interface DialogueStats {
    totalDialogueLines: number;
    dialoguePercentage: number;
    speakerFrequency: Map<string, number>;
    averageDialogueLength: number;
    dialogueToNarrationRatio: number;
}

/**
 * Analyzes dialogue patterns and attribution in the text.
 */
export function analyzeDialogue(text: string): DialogueStats {
    // Match dialogue patterns: "...", "...", « ... », etc.
    const dialogueRegex = /["「『"«]([^"」』"»]+)["」』"»]/g;
    const dialogueMatches = [...text.matchAll(dialogueRegex)];
    
    const totalChars = text.length;
    const dialogueChars = dialogueMatches.reduce((sum, m) => sum + m[1].length, 0);
    
    // Extract speaker attributions: "..." said X, X said "..."
    const speakerRegex = /["」』"»]\s*(?:said|asked|replied|shouted|whispered|muttered|exclaimed|cried|called|answered|responded|declared|announced|stated)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/gi;
    const speakerMatches = [...text.matchAll(speakerRegex)];
    
    const speakerFrequency = new Map<string, number>();
    for (const match of speakerMatches) {
        const speaker = match[1].trim();
        speakerFrequency.set(speaker, (speakerFrequency.get(speaker) || 0) + 1);
    }
    
    const narrationChars = totalChars - dialogueChars;
    
    return {
        totalDialogueLines: dialogueMatches.length,
        dialoguePercentage: totalChars > 0 ? (dialogueChars / totalChars) * 100 : 0,
        speakerFrequency,
        averageDialogueLength: dialogueMatches.length > 0 
            ? dialogueChars / dialogueMatches.length 
            : 0,
        dialogueToNarrationRatio: narrationChars > 0 
            ? dialogueChars / narrationChars 
            : 0
    };
}

// ═══════════════════════════════════════════════════════════
// ── NARRATIVE STRUCTURE DETECTION ──────────────────────────
// ═══════════════════════════════════════════════════════════

export type NarrativeStructure = 
    | 'three-act'
    | 'five-act'
    | 'heros-journey'
    | 'episodic'
    | 'linear'
    | 'nonlinear'
    | 'frame-narrative'
    | 'unknown';

export interface StructureAnalysis {
    structure: NarrativeStructure;
    confidence: number;
    actBreaks: number[];
    climaxPosition: number;
    hasFlashback: boolean;
    hasFrameNarrative: boolean;
}

/**
 * Detects the narrative structure of the text.
 */
export function detectNarrativeStructure(text: string): StructureAnalysis {
    const sentences = splitSentences(text);
    const sceneBreaks = detectSceneBoundaries(text);
    const emotionalArc = computeEmotionalArc(text, 10);
    
    // Find climax position (peak tension/emotion)
    let maxTension = -Infinity;
    let climaxIdx = 0;
    emotionalArc.forEach((point, idx) => {
        if (point.tension > maxTension) {
            maxTension = point.tension;
            climaxIdx = idx;
        }
    });
    const climaxPosition = emotionalArc.length > 0 ? climaxIdx / emotionalArc.length : 0.5;
    
    // Detect flashback indicators
    const flashbackIndicators = /\b(remembered|recalled|years ago|back then|in those days|looking back|memory|flashback|earlier that|when [a-z]+ was young)\b/gi;
    const hasFlashback = flashbackIndicators.test(text);
    
    // Detect frame narrative ("I'll tell you a story", "Let me tell you about")
    const frameIndicators = /\b(let me tell you|i['']ll tell you|this is the story|once upon a time|the story begins|as the old man said)\b/gi;
    const hasFrameNarrative = frameIndicators.test(text);
    
    // Determine structure based on patterns
    let structure: NarrativeStructure = 'unknown';
    let confidence = 0.3;
    
    if (hasFrameNarrative) {
        structure = 'frame-narrative';
        confidence = 0.6;
    } else if (hasFlashback && climaxPosition < 0.3) {
        structure = 'nonlinear';
        confidence = 0.5;
    } else if (sceneBreaks.length >= 8 && Math.abs(climaxPosition - 0.75) < 0.15) {
        // 5-act: exposition, rising, climax at ~75%, falling, denouement
        structure = 'five-act';
        confidence = 0.55;
    } else if (sceneBreaks.length >= 3 && Math.abs(climaxPosition - 0.65) < 0.2) {
        // 3-act: setup (25%), confrontation (50%), resolution (25%)
        structure = 'three-act';
        confidence = 0.6;
    } else if (sceneBreaks.length >= 10) {
        structure = 'episodic';
        confidence = 0.45;
    } else {
        structure = 'linear';
        confidence = 0.4;
    }
    
    // Calculate act breaks based on detected structure
    const actBreaks: number[] = [];
    if (structure === 'three-act') {
        actBreaks.push(Math.floor(sentences.length * 0.25));
        actBreaks.push(Math.floor(sentences.length * 0.75));
    } else if (structure === 'five-act') {
        actBreaks.push(Math.floor(sentences.length * 0.2));
        actBreaks.push(Math.floor(sentences.length * 0.4));
        actBreaks.push(Math.floor(sentences.length * 0.6));
        actBreaks.push(Math.floor(sentences.length * 0.8));
    }
    
    return {
        structure,
        confidence,
        actBreaks,
        climaxPosition,
        hasFlashback,
        hasFrameNarrative
    };
}

// ═══════════════════════════════════════════════════════════
// ── TEXT COHESION ANALYSIS ─────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface CohesionAnalysis {
    overallCohesion: number;
    paragraphCohesion: number[];
    lexicalChains: Map<string, number>;
    referentialCohesion: number;
    connectives: number;
}

/**
 * Analyzes textual cohesion (how well the text flows).
 */
export function analyzeCohesion(text: string): CohesionAnalysis {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    // Cohesive connectives
    const connectives = /\b(however|therefore|moreover|furthermore|consequently|nevertheless|in addition|on the other hand|as a result|in contrast|similarly|likewise|meanwhile|subsequently|finally|firstly|secondly|thus|hence|accordingly)\b/gi;
    const connectiveMatches = text.match(connectives) || [];
    
    // Pronouns that create referential cohesion
    const pronouns = /\b(he|she|it|they|him|her|them|his|hers|their|this|that|these|those)\b/gi;
    const pronounMatches = text.match(pronouns) || [];
    
    const words = tokenise(text);
    const referentialCohesion = words.length > 0 ? pronounMatches.length / words.length : 0;
    
    // Build lexical chains (repeated content words)
    const lexicalChains = new Map<string, number>();
    const contentWords = words.filter(w => w.length > 4 && !/^(which|would|could|should|about|their|there|where|these|those)$/.test(w));
    
    for (const word of contentWords) {
        lexicalChains.set(word, (lexicalChains.get(word) || 0) + 1);
    }
    
    // Filter to only words appearing 3+ times (actual chains)
    for (const [word, count] of lexicalChains) {
        if (count < 3) lexicalChains.delete(word);
    }
    
    // Calculate paragraph-level cohesion
    const paragraphCohesion: number[] = [];
    for (let i = 1; i < paragraphs.length; i++) {
        const prevWords = new Set(tokenise(paragraphs[i - 1]));
        const currWords = tokenise(paragraphs[i]);
        const overlap = currWords.filter(w => prevWords.has(w)).length;
        const cohesion = currWords.length > 0 ? overlap / currWords.length : 0;
        paragraphCohesion.push(cohesion);
    }
    
    // Overall cohesion score
    const avgParagraphCohesion = paragraphCohesion.length > 0 
        ? paragraphCohesion.reduce((a, b) => a + b, 0) / paragraphCohesion.length 
        : 0;
    const connectiveDensity = words.length > 0 ? connectiveMatches.length / (words.length / 100) : 0;
    const chainDensity = lexicalChains.size / Math.max(1, words.length / 100);
    
    const overallCohesion = Math.min(1, (avgParagraphCohesion + referentialCohesion * 3 + connectiveDensity * 0.1 + chainDensity * 0.05) / 2);
    
    return {
        overallCohesion,
        paragraphCohesion,
        lexicalChains,
        referentialCohesion,
        connectives: connectiveMatches.length
    };
}

// ═══════════════════════════════════════════════════════════
// ── PLOT BEAT DETECTION ────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface PlotBeat {
    position: number;
    type: 'inciting-incident' | 'complication' | 'turning-point' | 'climax' | 'resolution' | 'revelation';
    text: string;
    confidence: number;
}

/**
 * Detects major plot beats/events in the narrative.
 */
export function detectPlotBeats(text: string): PlotBeat[] {
    const sentences = splitSentences(text);
    const beats: PlotBeat[] = [];
    
    // Keywords indicating different beat types
    const beatPatterns: Record<string, { regex: RegExp; type: PlotBeat['type'] }> = {
        inciting: {
            regex: /\b(suddenly|unexpectedly|one day|everything changed|began when|started when|discovered|found out|received [a-z]+ (letter|message|news))\b/i,
            type: 'inciting-incident'
        },
        complication: {
            regex: /\b(but then|however|unfortunately|problem was|obstacle|difficulty|challenge|struggle|conflict)\b/i,
            type: 'complication'
        },
        turning: {
            regex: /\b(realized|understood|decided|chose|moment of|point of no return|everything depended|had to)\b/i,
            type: 'turning-point'
        },
        climax: {
            regex: /\b(final(ly)?|at last|showdown|confrontation|battle|fight|face[d]? (off|against)|moment of truth)\b/i,
            type: 'climax'
        },
        resolution: {
            regex: /\b(peace|resolved|ended|concluded|happily|ever after|returned to|normal again|new beginning)\b/i,
            type: 'resolution'
        },
        revelation: {
            regex: /\b(secret|truth|reveal(ed)?|unveil(ed)?|discover(ed)?|learn(ed)? that|told [a-z]+ the truth|confession)\b/i,
            type: 'revelation'
        }
    };
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const position = i / sentences.length;
        
        for (const [, pattern] of Object.entries(beatPatterns)) {
            if (pattern.regex.test(sentence)) {
                // Check if this beat type makes sense at this position
                let confidence = 0.4;
                
                // Inciting incidents usually in first 20%
                if (pattern.type === 'inciting-incident' && position < 0.25) confidence += 0.3;
                // Climax usually 60-85%
                if (pattern.type === 'climax' && position > 0.55 && position < 0.9) confidence += 0.3;
                // Resolution usually last 15%
                if (pattern.type === 'resolution' && position > 0.8) confidence += 0.3;
                
                beats.push({
                    position,
                    type: pattern.type,
                    text: sentence.substring(0, 150),
                    confidence
                });
                break; // One beat type per sentence
            }
        }
    }
    
    // Deduplicate nearby beats of same type
    return beats.filter((beat, idx) => {
        if (idx === 0) return true;
        const prev = beats[idx - 1];
        return !(prev.type === beat.type && Math.abs(prev.position - beat.position) < 0.1);
    });
}

// ═══════════════════════════════════════════════════════════
// ── FORESHADOWING DETECTION ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface Foreshadowing {
    text: string;
    position: number;
    type: 'ominous' | 'symbolic' | 'prophecy' | 'chekhov-gun' | 'repetition';
    payoffPosition?: number;
}

/**
 * Detects potential foreshadowing in the narrative.
 */
export function detectForeshadowing(text: string): Foreshadowing[] {
    const sentences = splitSentences(text);
    const foreshadowing: Foreshadowing[] = [];
    
    // Ominous language patterns
    const ominousRegex = /\b(little did|if only|would later|would come to|not yet know|soon discover|fate|destined|doom|never imagined|last time|wouldn['']t be long)\b/i;
    
    // Symbolic/prophetic language
    const propheticRegex = /\b(prophecy|foretold|predicted|vision|dream[t]? of|omen|sign|warning|portent|premonition)\b/i;
    
    // Chekhov's gun pattern (explicit mention of weapons, objects)
    const chekovRegex = /\b(noticed|sat|hung|rested|lay)\s+(a|the|an)\s+(gun|knife|sword|weapon|letter|key|ring|locket|photograph)\b/i;
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const position = i / sentences.length;
        
        // Only look in first 70% for foreshadowing
        if (position > 0.7) continue;
        
        if (ominousRegex.test(sentence)) {
            foreshadowing.push({
                text: sentence.substring(0, 150),
                position,
                type: 'ominous'
            });
        } else if (propheticRegex.test(sentence)) {
            foreshadowing.push({
                text: sentence.substring(0, 150),
                position,
                type: 'prophecy'
            });
        } else if (chekovRegex.test(sentence)) {
            foreshadowing.push({
                text: sentence.substring(0, 150),
                position,
                type: 'chekhov-gun'
            });
        }
    }
    
    // Look for repeated motifs (potential symbolic foreshadowing)
    const motifCounts = new Map<string, number[]>();
    const motifRegex = /\b(shadow|light|dark|storm|rain|blood|mirror|clock|door|window|key|ring|fire|water|bird|wolf|snake|moon|sun|star)\b/gi;
    
    for (let i = 0; i < sentences.length; i++) {
        const matches = sentences[i].match(motifRegex);
        if (matches) {
            for (const match of matches) {
                const motif = match.toLowerCase();
                if (!motifCounts.has(motif)) motifCounts.set(motif, []);
                motifCounts.get(motif)!.push(i / sentences.length);
            }
        }
    }
    
    // Motifs appearing 3+ times that span the narrative
    for (const [motif, positions] of motifCounts) {
        if (positions.length >= 3) {
            const span = positions[positions.length - 1] - positions[0];
            if (span > 0.3) {
                foreshadowing.push({
                    text: `Recurring motif: "${motif}" appears ${positions.length} times`,
                    position: positions[0],
                    type: 'repetition',
                    payoffPosition: positions[positions.length - 1]
                });
            }
        }
    }
    
    return foreshadowing;
}

// ═══════════════════════════════════════════════════════════
// ── CHARACTER CO-OCCURRENCE GRAPH ──────────────────────────
// ═══════════════════════════════════════════════════════════

export interface CharacterEdge {
    character1: string;
    character2: string;
    weight: number;
    contexts: string[];
}

/**
 * Builds a character co-occurrence graph based on proximity.
 */
export function buildCharacterGraph(text: string, windowSize = 100): CharacterEdge[] {
    const characters = extractCharacters(text, 15);
    const charNames = characters.map(c => c.name);
    const edges = new Map<string, CharacterEdge>();
    
    // Sliding window co-occurrence
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
        const windowEnd = Math.min(i + windowSize, words.length);
        const windowText = words.slice(i, windowEnd).join(' ');
        
        const foundChars: string[] = [];
        for (const name of charNames) {
            if (windowText.toLowerCase().includes(name.toLowerCase())) {
                foundChars.push(name);
            }
        }
        
        // Create edges between all co-occurring characters
        for (let j = 0; j < foundChars.length; j++) {
            for (let k = j + 1; k < foundChars.length; k++) {
                const key = [foundChars[j], foundChars[k]].sort().join('|');
                
                if (!edges.has(key)) {
                    edges.set(key, {
                        character1: foundChars[j],
                        character2: foundChars[k],
                        weight: 0,
                        contexts: []
                    });
                }
                
                const edge = edges.get(key)!;
                edge.weight += 1;
                
                // Store up to 3 context snippets
                if (edge.contexts.length < 3) {
                    const context = windowText.substring(0, 100);
                    if (!edge.contexts.includes(context)) {
                        edge.contexts.push(context);
                    }
                }
            }
        }
    }
    
    return Array.from(edges.values()).sort((a, b) => b.weight - a.weight);
}

// ═══════════════════════════════════════════════════════════
// ── READING TIME ESTIMATION ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface ReadingTime {
    minutes: number;
    seconds: number;
    wordsPerMinute: number;
    adjustedForComplexity: number;
}

/**
 * Estimates reading time based on word count and complexity.
 */
export function estimateReadingTime(text: string, wpm = 200): ReadingTime {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    // Get complexity from readability
    const readability = computeReadability(text);
    
    // Adjust WPM based on complexity (harder = slower)
    const complexityMultiplier = readability.gradeLevel.includes('College') ? 0.8 
        : readability.gradeLevel.includes('12th') ? 0.85
        : readability.gradeLevel.includes('11th') ? 0.9
        : readability.gradeLevel.includes('10th') ? 0.92
        : readability.gradeLevel.includes('9th') ? 0.95
        : 1.0;
    
    const adjustedWpm = wpm * complexityMultiplier;
    const totalMinutes = wordCount / adjustedWpm;
    
    return {
        minutes: Math.floor(totalMinutes),
        seconds: Math.round((totalMinutes - Math.floor(totalMinutes)) * 60),
        wordsPerMinute: adjustedWpm,
        adjustedForComplexity: complexityMultiplier
    };
}

// ═══════════════════════════════════════════════════════════
// ── WORD FREQUENCY ANALYSIS ────────────────────────────────
// ═══════════════════════════════════════════════════════════

export interface WordFrequency {
    word: string;
    count: number;
    percentage: number;
    isStopWord: boolean;
}

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
    'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
    'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all',
    'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
]);

/**
 * Analyzes word frequency distribution.
 */
export function analyzeWordFrequency(text: string, topN = 50): WordFrequency[] {
    const words = tokenise(text);
    const totalWords = words.length;
    const counts = new Map<string, number>();
    
    for (const word of words) {
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    
    const frequencies: WordFrequency[] = [];
    for (const [word, count] of counts) {
        frequencies.push({
            word,
            count,
            percentage: (count / totalWords) * 100,
            isStopWord: STOP_WORDS.has(word)
        });
    }
    
    return frequencies.sort((a, b) => b.count - a.count).slice(0, topN);
}

// ═══════════════════════════════════════════════════════════
// ── SENTENCE COMPLEXITY ANALYSIS ───────────────────────────
// ═══════════════════════════════════════════════════════════

export interface SentenceComplexity {
    sentence: string;
    wordCount: number;
    avgWordLength: number;
    clauseCount: number;
    complexityScore: number;
}

/**
 * Analyzes complexity of individual sentences.
 */
export function analyzeSentenceComplexity(text: string): SentenceComplexity[] {
    const sentences = splitSentences(text);
    
    return sentences.map(sentence => {
        const words = sentence.split(/\s+/).filter(w => w.length > 0);
        const wordCount = words.length;
        const totalChars = words.reduce((sum, w) => sum + w.replace(/[^a-z]/gi, '').length, 0);
        const avgWordLength = wordCount > 0 ? totalChars / wordCount : 0;
        
        // Estimate clauses by counting conjunctions and punctuation
        const clauseIndicators = sentence.match(/,|;|:|\band\b|\bor\b|\bbut\b|\bwhen\b|\bwhile\b|\bif\b|\bbecause\b|\balthough\b/gi) || [];
        const clauseCount = clauseIndicators.length + 1;
        
        // Complexity score based on multiple factors
        const complexityScore = (wordCount / 20) * 0.4 + 
            (avgWordLength / 6) * 0.3 + 
            (clauseCount / 4) * 0.3;
        
        return {
            sentence: sentence.length > 100 ? sentence.substring(0, 100) + '...' : sentence,
            wordCount,
            avgWordLength,
            clauseCount,
            complexityScore: Math.min(1, complexityScore)
        };
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ══ CINEMATIC ALGORITHMS ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// ── SCENE TIMING & PACING ──────────────────────────────────

export interface SceneTiming {
    sceneDuration: 'short' | 'medium' | 'long' | 'extended';
    pacingBeat: 'rapid' | 'steady' | 'slow' | 'pause';
    transitionType: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'match-cut';
    holdDuration: number; // relative 0-1 scale
}

/**
 * Calculates cinematic timing for a text segment based on content.
 */
export function calculateSceneTiming(text: string, prevSentiment = 0): SceneTiming {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const sentiment = analyseSentiment(text);
    const tension = scoreTension(text);
    
    // Scene duration based on word count
    const sceneDuration: SceneTiming['sceneDuration'] = 
        wordCount < 20 ? 'short' :
        wordCount < 60 ? 'medium' :
        wordCount < 150 ? 'long' : 'extended';
    
    // Pacing beat based on tension and action words
    const actionWords = /\b(ran|jumped|exploded|crashed|screamed|fought|attacked|fled|chased|sprinted|dove|slammed|burst)\b/gi;
    const hasAction = actionWords.test(text);
    
    const pacingBeat: SceneTiming['pacingBeat'] = 
        hasAction && tension > 0.6 ? 'rapid' :
        tension > 0.4 ? 'steady' :
        wordCount < 15 ? 'pause' : 'slow';
    
    // Transition type based on sentiment shift
    const sentimentShift = Math.abs(sentiment.score - prevSentiment);
    const transitionType: SceneTiming['transitionType'] = 
        sentimentShift > 0.5 ? 'cut' :
        sentimentShift > 0.3 ? 'dissolve' :
        text.includes('Meanwhile') || text.includes('Elsewhere') ? 'wipe' :
        text.toLowerCase().includes('remembered') || text.toLowerCase().includes('flashback') ? 'dissolve' :
        'fade';
    
    // Hold duration for dramatic effect
    const holdDuration = Math.min(1, (tension * 0.5) + (sentimentShift * 0.3) + (wordCount < 10 ? 0.2 : 0));
    
    return { sceneDuration, pacingBeat, transitionType, holdDuration };
}

// ── VISUAL RHYTHM DETECTION ────────────────────────────────

export interface VisualRhythm {
    rhythmPattern: 'staccato' | 'legato' | 'syncopated' | 'crescendo' | 'diminuendo';
    beatStrength: number[];
    averageBeatInterval: number;
    rhythmScore: number;
}

/**
 * Detects visual/narrative rhythm in text for panel pacing.
 */
export function detectVisualRhythm(text: string): VisualRhythm {
    const sentences = splitSentences(text);
    const beatStrength: number[] = [];
    
    for (const sentence of sentences) {
        const words = sentence.split(/\s+/).length;
        const hasPunctuation = /[!?—]/.test(sentence);
        const tension = scoreTension(sentence);
        
        // Beat strength: short sentences + punctuation + tension = stronger beats
        const strength = (1 - Math.min(1, words / 30)) * 0.4 +
            (hasPunctuation ? 0.3 : 0) +
            tension * 0.3;
        
        beatStrength.push(strength);
    }
    
    // Analyze rhythm pattern
    const avgStrength = beatStrength.reduce((a, b) => a + b, 0) / Math.max(1, beatStrength.length);
    const variation = beatStrength.reduce((sum, b) => sum + Math.abs(b - avgStrength), 0) / Math.max(1, beatStrength.length);
    
    // Detect trend
    const firstHalf = beatStrength.slice(0, Math.floor(beatStrength.length / 2));
    const secondHalf = beatStrength.slice(Math.floor(beatStrength.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / Math.max(1, secondHalf.length);
    
    let rhythmPattern: VisualRhythm['rhythmPattern'];
    if (secondAvg - firstAvg > 0.15) {
        rhythmPattern = 'crescendo';
    } else if (firstAvg - secondAvg > 0.15) {
        rhythmPattern = 'diminuendo';
    } else if (variation > 0.25) {
        rhythmPattern = avgStrength > 0.5 ? 'syncopated' : 'staccato';
    } else {
        rhythmPattern = 'legato';
    }
    
    return {
        rhythmPattern,
        beatStrength,
        averageBeatInterval: sentences.length > 1 ? 1 / sentences.length : 1,
        rhythmScore: avgStrength
    };
}

// ── DRAMATIC BEAT ANALYSIS ─────────────────────────────────

export interface DramaticBeat {
    type: 'setup' | 'tension-build' | 'peak' | 'release' | 'aftermath' | 'transition';
    intensity: number;
    emotionalCharge: 'positive' | 'negative' | 'neutral' | 'mixed';
    suggestedEmphasis: 'subtle' | 'moderate' | 'strong' | 'explosive';
}

/**
 * Analyzes dramatic beats for cinematic storytelling.
 */
export function analyzeDramaticBeat(text: string, position: number): DramaticBeat {
    const sentiment = analyseSentiment(text);
    const tension = scoreTension(text);
    
    // Determine emotional charge
    const emotionalCharge: DramaticBeat['emotionalCharge'] = 
        Math.abs(sentiment.score) < 0.1 ? 'neutral' :
        sentiment.score > 0.2 ? 'positive' :
        sentiment.score < -0.2 ? 'negative' : 'mixed';
    
    // Determine beat type based on position and tension
    let type: DramaticBeat['type'];
    if (position < 0.15) {
        type = 'setup';
    } else if (position > 0.85) {
        type = 'aftermath';
    } else if (tension > 0.7) {
        type = 'peak';
    } else if (tension > 0.4) {
        type = 'tension-build';
    } else if (tension < 0.2 && position > 0.5) {
        type = 'release';
    } else {
        type = 'transition';
    }
    
    // Emphasis based on tension and emotional intensity
    const intensity = (tension + Math.abs(sentiment.score)) / 2;
    const suggestedEmphasis: DramaticBeat['suggestedEmphasis'] = 
        intensity > 0.75 ? 'explosive' :
        intensity > 0.5 ? 'strong' :
        intensity > 0.25 ? 'moderate' : 'subtle';
    
    return { type, intensity, emotionalCharge, suggestedEmphasis };
}

// ── CAMERA ANGLE SUGGESTIONS ───────────────────────────────

export type CameraAngle = 
    | 'extreme-close-up' 
    | 'close-up' 
    | 'medium-shot' 
    | 'wide-shot' 
    | 'extreme-wide' 
    | 'birds-eye' 
    | 'low-angle' 
    | 'high-angle' 
    | 'dutch-angle'
    | 'over-shoulder';

export interface CameraSuggestion {
    primaryAngle: CameraAngle;
    alternativeAngle: CameraAngle;
    movement: 'static' | 'pan' | 'zoom-in' | 'zoom-out' | 'track' | 'crane';
    focus: 'character' | 'environment' | 'object' | 'action';
    reasoning: string;
}

/**
 * Suggests camera angles based on narrative content.
 */
export function suggestCameraAngle(text: string, panelType: string): CameraSuggestion {
    const tension = scoreTension(text);
    const sentiment = analyseSentiment(text);
    const isDialogue = panelType === 'dialogue';
    
    // Detect emotional content
    const hasEmotion = /\b(tears|crying|laughing|screaming|whispering|stared|gazed|glared)\b/i.test(text);
    const hasAction = /\b(ran|jumped|fought|attacked|exploded|crashed|chased)\b/i.test(text);
    const hasEnvironment = /\b(city|forest|mountain|ocean|sky|room|building|landscape)\b/i.test(text);
    const hasIntimacy = /\b(whispered|softly|gently|held|embraced|touched)\b/i.test(text);
    
    let primaryAngle: CameraAngle;
    let alternativeAngle: CameraAngle;
    let movement: CameraSuggestion['movement'];
    let focus: CameraSuggestion['focus'];
    let reasoning: string;
    
    if (hasEmotion || hasIntimacy) {
        primaryAngle = 'close-up';
        alternativeAngle = 'extreme-close-up';
        movement = 'zoom-in';
        focus = 'character';
        reasoning = 'Emotional moment requires intimate framing';
    } else if (hasAction && tension > 0.6) {
        primaryAngle = 'wide-shot';
        alternativeAngle = 'low-angle';
        movement = 'track';
        focus = 'action';
        reasoning = 'High-tension action benefits from dynamic wide framing';
    } else if (hasEnvironment) {
        primaryAngle = 'extreme-wide';
        alternativeAngle = 'birds-eye';
        movement = 'pan';
        focus = 'environment';
        reasoning = 'Environmental description calls for establishing shot';
    } else if (isDialogue) {
        primaryAngle = 'medium-shot';
        alternativeAngle = 'over-shoulder';
        movement = 'static';
        focus = 'character';
        reasoning = 'Dialogue scene uses conversational framing';
    } else if (tension > 0.7) {
        primaryAngle = 'dutch-angle';
        alternativeAngle = 'low-angle';
        movement = 'zoom-in';
        focus = 'character';
        reasoning = 'High tension creates unease with tilted framing';
    } else {
        primaryAngle = 'medium-shot';
        alternativeAngle = 'wide-shot';
        movement = 'static';
        focus = sentiment.score > 0 ? 'character' : 'environment';
        reasoning = 'Standard narrative framing';
    }
    
    return { primaryAngle, alternativeAngle, movement, focus, reasoning };
}

// ── PANEL COMPOSITION ANALYSIS ─────────────────────────────

export interface PanelComposition {
    layout: 'full-bleed' | 'standard' | 'split' | 'inset' | 'borderless' | 'overlapping';
    visualWeight: 'left' | 'center' | 'right' | 'balanced';
    aspectRatio: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'vertical-slice';
    suggestedSize: 'small' | 'medium' | 'large' | 'splash';
    whitespace: 'minimal' | 'moderate' | 'generous';
}

/**
 * Suggests panel composition based on content.
 */
export function suggestPanelComposition(text: string, importance: number): PanelComposition {
    const wordCount = text.split(/\s+/).length;
    const tension = scoreTension(text);
    const isSceneTransition = /\b(meanwhile|later|elsewhere|suddenly|then)\b/i.test(text);
    
    // Layout based on content type
    const layout: PanelComposition['layout'] = 
        importance > 0.8 ? 'full-bleed' :
        isSceneTransition ? 'borderless' :
        tension > 0.7 ? 'overlapping' :
        wordCount < 10 ? 'inset' : 'standard';
    
    // Visual weight distribution
    const hasDialogue = /"[^"]+"|「[^」]+」/.test(text);
    const visualWeight: PanelComposition['visualWeight'] = 
        hasDialogue ? 'center' :
        importance > 0.5 ? 'balanced' :
        Math.random() > 0.5 ? 'left' : 'right';
    
    // Aspect ratio based on content
    const aspectRatio: PanelComposition['aspectRatio'] = 
        importance > 0.9 ? 'panoramic' :
        wordCount > 80 ? 'landscape' :
        tension > 0.6 ? 'portrait' :
        hasDialogue ? 'square' : 'landscape';
    
    // Size based on importance and word count
    const suggestedSize: PanelComposition['suggestedSize'] = 
        importance > 0.85 ? 'splash' :
        importance > 0.6 || wordCount > 60 ? 'large' :
        wordCount < 20 ? 'small' : 'medium';
    
    // Whitespace
    const whitespace: PanelComposition['whitespace'] = 
        tension > 0.6 ? 'minimal' :
        importance > 0.7 ? 'generous' : 'moderate';
    
    return { layout, visualWeight, aspectRatio, suggestedSize, whitespace };
}

// ── MOOD TRANSITION ANALYSIS ───────────────────────────────

export interface MoodTransition {
    fromMood: string;
    toMood: string;
    transitionSpeed: 'instant' | 'quick' | 'gradual' | 'slow';
    transitionStyle: 'smooth' | 'jarring' | 'dramatic' | 'subtle';
    colorShift: 'warm-to-cool' | 'cool-to-warm' | 'bright-to-dark' | 'dark-to-bright' | 'stable';
}

/**
 * Analyzes mood transitions between text segments.
 */
export function analyzeMoodTransition(prevText: string, currentText: string): MoodTransition {
    const prevSentiment = analyseSentiment(prevText);
    const currSentiment = analyseSentiment(currentText);
    const prevTension = scoreTension(prevText);
    const currTension = scoreTension(currentText);
    
    // Determine mood labels
    const getMood = (sentiment: number, tension: number): string => {
        if (tension > 0.6) return sentiment > 0 ? 'triumphant' : 'intense';
        if (tension > 0.3) return sentiment > 0 ? 'hopeful' : 'anxious';
        if (sentiment > 0.3) return 'cheerful';
        if (sentiment < -0.3) return 'melancholic';
        return 'neutral';
    };
    
    const fromMood = getMood(prevSentiment.score, prevTension);
    const toMood = getMood(currSentiment.score, currTension);
    
    // Calculate transition metrics
    const sentimentDelta = Math.abs(currSentiment.score - prevSentiment.score);
    const tensionDelta = Math.abs(currTension - prevTension);
    const totalDelta = (sentimentDelta + tensionDelta) / 2;
    
    // Transition speed
    const transitionSpeed: MoodTransition['transitionSpeed'] = 
        totalDelta > 0.6 ? 'instant' :
        totalDelta > 0.4 ? 'quick' :
        totalDelta > 0.2 ? 'gradual' : 'slow';
    
    // Transition style
    const transitionStyle: MoodTransition['transitionStyle'] = 
        totalDelta > 0.7 ? 'jarring' :
        totalDelta > 0.5 ? 'dramatic' :
        totalDelta > 0.25 ? 'smooth' : 'subtle';
    
    // Color shift
    let colorShift: MoodTransition['colorShift'] = 'stable';
    if (currSentiment.score > prevSentiment.score + 0.2) {
        colorShift = currTension > prevTension ? 'cool-to-warm' : 'dark-to-bright';
    } else if (currSentiment.score < prevSentiment.score - 0.2) {
        colorShift = currTension > prevTension ? 'bright-to-dark' : 'warm-to-cool';
    }
    
    return { fromMood, toMood, transitionSpeed, transitionStyle, colorShift };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ══ OPTIMIZATION ALGORITHMS ════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// ── OPTIMAL TEXT CHUNKING ──────────────────────────────────

export interface TextChunk {
    text: string;
    startIndex: number;
    endIndex: number;
    type: 'paragraph' | 'sentence' | 'scene' | 'dialogue-block';
    score: number;
}

/**
 * Chunks text optimally for panel distribution.
 */
export function chunkTextOptimally(
    text: string, 
    targetChunkSize = 150, 
    maxChunkSize = 300
): TextChunk[] {
    const chunks: TextChunk[] = [];
    const paragraphs = text.split(/\n\s*\n/);
    let globalIndex = 0;
    
    for (const paragraph of paragraphs) {
        if (paragraph.trim().length === 0) {
            globalIndex += paragraph.length + 2;
            continue;
        }
        
        // Check if it's a dialogue block
        const isDialogue = /^["「『]|said|asked|replied/i.test(paragraph);
        
        // Check if paragraph is within acceptable size
        const words = paragraph.split(/\s+/);
        
        if (words.length <= maxChunkSize / 5) {
            chunks.push({
                text: paragraph.trim(),
                startIndex: globalIndex,
                endIndex: globalIndex + paragraph.length,
                type: isDialogue ? 'dialogue-block' : 'paragraph',
                score: Math.min(1, words.length / targetChunkSize * 5)
            });
        } else {
            // Split into sentences for large paragraphs
            const sentences = splitSentences(paragraph);
            let accumulator = '';
            let sentenceStart = globalIndex;
            
            for (const sentence of sentences) {
                const wouldExceed = (accumulator + ' ' + sentence).split(/\s+/).length > targetChunkSize / 5;
                
                if (wouldExceed && accumulator.length > 0) {
                    chunks.push({
                        text: accumulator.trim(),
                        startIndex: sentenceStart,
                        endIndex: sentenceStart + accumulator.length,
                        type: 'sentence',
                        score: Math.min(1, accumulator.split(/\s+/).length / (targetChunkSize / 5))
                    });
                    accumulator = sentence;
                    sentenceStart = globalIndex + paragraph.indexOf(sentence);
                } else {
                    accumulator = accumulator ? accumulator + ' ' + sentence : sentence;
                }
            }
            
            if (accumulator.trim().length > 0) {
                chunks.push({
                    text: accumulator.trim(),
                    startIndex: sentenceStart,
                    endIndex: sentenceStart + accumulator.length,
                    type: 'sentence',
                    score: Math.min(1, accumulator.split(/\s+/).length / (targetChunkSize / 5))
                });
            }
        }
        
        globalIndex += paragraph.length + 2;
    }
    
    return chunks;
}

// ── TEXT DEDUPLICATION ─────────────────────────────────────

export interface DeduplicationResult {
    uniqueChunks: string[];
    duplicates: Array<{ text: string; positions: number[]; }>;
    duplicationRatio: number;
}

/**
 * Identifies and removes duplicate or near-duplicate text segments.
 */
export function deduplicateText(texts: string[], threshold = 0.85): DeduplicationResult {
    const uniqueChunks: string[] = [];
    const duplicates: Array<{ text: string; positions: number[] }> = [];
    const seen = new Map<string, number[]>();
    
    for (let i = 0; i < texts.length; i++) {
        const text = texts[i].trim();
        if (text.length === 0) continue;
        
        // Fast hash for exact match
        const hash = fastHash(text);
        
        // Check for exact duplicates
        let isDuplicate = false;
        for (const [seenText, positions] of seen) {
            const seenHash = fastHash(seenText);
            
            // Exact match
            if (hash === seenHash && text === seenText) {
                positions.push(i);
                isDuplicate = true;
                break;
            }
            
            // Near-duplicate check for similar lengths
            if (Math.abs(text.length - seenText.length) < text.length * 0.2) {
                const similarity = jaccardSimilarity(text, seenText);
                if (similarity >= threshold) {
                    positions.push(i);
                    isDuplicate = true;
                    break;
                }
            }
        }
        
        if (!isDuplicate) {
            uniqueChunks.push(text);
            seen.set(text, [i]);
        }
    }
    
    // Extract duplicates
    for (const [text, positions] of seen) {
        if (positions.length > 1) {
            duplicates.push({ text: text.substring(0, 50) + '...', positions });
        }
    }
    
    return {
        uniqueChunks,
        duplicates,
        duplicationRatio: 1 - (uniqueChunks.length / Math.max(1, texts.length))
    };
}

// ── BATCH PROCESSING UTILITIES ─────────────────────────────

export interface BatchConfig {
    batchSize: number;
    parallelLimit: number;
    delayBetweenBatches: number;
}

/**
 * Process items in optimized batches.
 */
export async function processBatches<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    config: Partial<BatchConfig> = {}
): Promise<R[]> {
    const { batchSize = 10, parallelLimit = 3, delayBetweenBatches = 0 } = config;
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults: R[] = [];
        
        // Process batch with limited parallelism
        for (let j = 0; j < batch.length; j += parallelLimit) {
            const chunk = batch.slice(j, j + parallelLimit);
            const chunkResults = await Promise.all(
                chunk.map((item, idx) => processor(item, i + j + idx))
            );
            batchResults.push(...chunkResults);
        }
        
        results.push(...batchResults);
        
        // Delay between batches
        if (delayBetweenBatches > 0 && i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, delayBetweenBatches));
        }
    }
    
    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ══ PERFORMANCE ALGORITHMS ═════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════

// ── FAST TEXT HASHING ──────────────────────────────────────

/**
 * Fast non-cryptographic hash for text (FNV-1a inspired).
 */
export function fastHash(text: string): number {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash;
}

/**
 * Fast string similarity using Jaccard index on word sets.
 */
export function jaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    let intersection = 0;
    for (const word of words1) {
        if (words2.has(word)) intersection++;
    }
    
    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
}

// ── MEMOIZATION ────────────────────────────────────────────

interface MemoEntry<T> {
    value: T;
    timestamp: number;
}

/**
 * Creates a memoized version of a function with TTL cache.
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
    fn: T,
    options: { maxSize?: number; ttlMs?: number; keyFn?: (...args: Parameters<T>) => string } = {}
): T {
    const { maxSize = 100, ttlMs = 60000, keyFn } = options;
    const cache = new Map<string, MemoEntry<ReturnType<T>>>();
    
    const memoized = ((...args: Parameters<T>): ReturnType<T> => {
        const key = keyFn ? keyFn(...args) : JSON.stringify(args);
        const now = Date.now();
        
        // Check cache
        const cached = cache.get(key);
        if (cached && now - cached.timestamp < ttlMs) {
            return cached.value;
        }
        
        // Compute and cache
        const result = fn(...args) as ReturnType<T>;
        
        // LRU eviction
        if (cache.size >= maxSize) {
            const oldest = Array.from(cache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            if (oldest) cache.delete(oldest[0]);
        }
        
        cache.set(key, { value: result, timestamp: now });
        return result;
    }) as T;
    
    return memoized;
}

// ── STREAMING TEXT ANALYSIS ────────────────────────────────

export interface StreamingAnalysis {
    wordCount: number;
    sentenceCount: number;
    avgWordLength: number;
    avgSentenceLength: number;
    runningTension: number;
    runningsentiment: number;
}

/**
 * Streaming text analyzer for incremental updates.
 */
export class StreamingTextAnalyzer {
    private wordCount = 0;
    private sentenceCount = 0;
    private totalWordLength = 0;
    private totalSentenceWords = 0;
    private tensionSum = 0;
    private sentimentSum = 0;
    private chunkCount = 0;
    
    /**
     * Process a chunk of text incrementally.
     */
    processChunk(text: string): void {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        this.wordCount += words.length;
        this.sentenceCount += sentences.length;
        this.totalWordLength += words.reduce((sum, w) => sum + w.length, 0);
        this.totalSentenceWords += words.length;
        
        // Running averages for tension/sentiment
        this.tensionSum += scoreTension(text);
        this.sentimentSum += analyseSentiment(text).score;
        this.chunkCount++;
    }
    
    /**
     * Get current analysis state.
     */
    getAnalysis(): StreamingAnalysis {
        return {
            wordCount: this.wordCount,
            sentenceCount: this.sentenceCount,
            avgWordLength: this.wordCount > 0 ? this.totalWordLength / this.wordCount : 0,
            avgSentenceLength: this.sentenceCount > 0 ? this.wordCount / this.sentenceCount : 0,
            runningTension: this.chunkCount > 0 ? this.tensionSum / this.chunkCount : 0,
            runningsentiment: this.chunkCount > 0 ? this.sentimentSum / this.chunkCount : 0
        };
    }
    
    /**
     * Reset analyzer state.
     */
    reset(): void {
        this.wordCount = 0;
        this.sentenceCount = 0;
        this.totalWordLength = 0;
        this.totalSentenceWords = 0;
        this.tensionSum = 0;
        this.sentimentSum = 0;
        this.chunkCount = 0;
    }
}

// ── LAZY EVALUATION ────────────────────────────────────────

/**
 * Lazy evaluation wrapper for expensive computations.
 */
export class LazyValue<T> {
    private computed = false;
    private value: T | undefined;
    private readonly compute: () => T;
    
    constructor(compute: () => T) {
        this.compute = compute;
    }
    
    get(): T {
        if (!this.computed) {
            this.value = this.compute();
            this.computed = true;
        }
        return this.value!;
    }
    
    isComputed(): boolean {
        return this.computed;
    }
    
    reset(): void {
        this.computed = false;
        this.value = undefined;
    }
}

// ── DEBOUNCED ANALYSIS ─────────────────────────────────────

/**
 * Creates a debounced function that delays analysis until input stabilizes.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delayMs: number
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delayMs);
    };
}

/**
 * Creates a throttled function that limits execution rate.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limitMs: number
): (...args: Parameters<T>) => void {
    let lastRun = 0;
    let scheduled = false;
    let lastArgs: Parameters<T> | null = null;
    
    return (...args: Parameters<T>) => {
        const now = Date.now();
        lastArgs = args;
        
        if (now - lastRun >= limitMs) {
            fn(...args);
            lastRun = now;
        } else if (!scheduled) {
            scheduled = true;
            setTimeout(() => {
                fn(...lastArgs!);
                lastRun = Date.now();
                scheduled = false;
            }, limitMs - (now - lastRun));
        }
    };
}

// ── PARALLEL ANALYSIS PIPELINE ─────────────────────────────

export interface AnalysisPipelineResult {
    sentiment: ReturnType<typeof analyseSentiment>;
    tension: number;
    readability: ReturnType<typeof computeReadability>;
    keywords: ReturnType<typeof extractKeywords>;
    pacing: ReturnType<typeof analysePacing>;
}

/**
 * Run multiple analyses in an optimized pipeline.
 */
export function runAnalysisPipeline(text: string): AnalysisPipelineResult {
    // Pre-compute shared data
    const sentences = splitSentences(text);
    const words = tokenise(text);
    
    // Run analyses (could be parallelized with workers)
    return {
        sentiment: analyseSentiment(text),
        tension: scoreTension(text),
        readability: computeReadability(text),
        keywords: extractKeywords(text, 10),
        pacing: analysePacing(text)
    };
}

// ── CONTENT FINGERPRINTING ─────────────────────────────────

export interface ContentFingerprint {
    hash: number;
    wordCount: number;
    firstWords: string;
    lastWords: string;
    signature: string;
}

/**
 * Generate a unique fingerprint for content identification and deduplication.
 */
export function generateFingerprint(text: string): ContentFingerprint {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const hash = fastHash(text);
    
    // Extract key features for fingerprint
    const firstWords = words.slice(0, 5).join(' ');
    const lastWords = words.slice(-5).join(' ');
    
    // Create compact signature: hash + length + first/last word hashes
    const signature = `${hash.toString(36)}-${words.length}-${fastHash(firstWords).toString(36)}-${fastHash(lastWords).toString(36)}`;
    
    return {
        hash,
        wordCount: words.length,
        firstWords,
        lastWords,
        signature
    };
}
