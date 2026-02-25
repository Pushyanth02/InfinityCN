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
    love: 3,
    amazing: 4,
    wonderful: 4,
    beautiful: 3,
    excellent: 4,
    great: 3,
    happy: 3,
    joy: 3,
    joyful: 3,
    good: 2,
    kind: 2,
    bright: 2,
    hope: 2,
    hopeful: 3,
    peace: 3,
    peaceful: 3,
    smile: 2,
    laugh: 2,
    warm: 2,
    gentle: 2,
    free: 2,
    freedom: 3,
    courage: 3,
    brave: 3,
    strong: 2,
    triumph: 4,
    victory: 4,
    succeed: 3,
    success: 3,
    safe: 2,
    saved: 3,
    alive: 2,
    light: 2,
    glow: 2,
    shine: 2,
    brilliant: 4,
    perfect: 3,
    trust: 2,
    true: 1,
    loyal: 2,
    care: 2,
    cherish: 3,
    proud: 2,
    hero: 3,
    protect: 2,
    rescue: 3,
    survive: 2,
    grateful: 3,

    // Negative (-1 to -5)
    hate: -3,
    terrible: -4,
    awful: -4,
    horrible: -4,
    bad: -2,
    dark: -1,
    evil: -4,
    kill: -4,
    killed: -4,
    murder: -5,
    death: -3,
    dead: -3,
    die: -3,
    dying: -3,
    blood: -2,
    pain: -3,
    suffer: -3,
    suffering: -3,
    cruel: -4,
    monster: -4,
    fear: -3,
    afraid: -3,
    terror: -4,
    horror: -4,
    scream: -2,
    cry: -2,
    sad: -2,
    grief: -3,
    loss: -2,
    lost: -2,
    alone: -2,
    betrayal: -4,
    betray: -4,
    lie: -2,
    liar: -3,
    weak: -2,
    fail: -2,
    failure: -3,
    broken: -3,
    destroy: -4,
    chaos: -3,
    war: -3,
    attack: -3,
    violence: -3,
    trapped: -3,
    helpless: -3,
    despair: -4,
    rage: -3,
    fury: -3,
    anger: -2,
    angry: -2,
    enemy: -2,
    danger: -3,
    threat: -3,
    corrupt: -3,
    bleed: -3,
    wound: -2,
    curse: -3,
    poison: -3,
    shadow: -2,
    cold: -1,
    bitter: -2,
    guilty: -3,
    shame: -3,
    regret: -3,
    misery: -4,
    disaster: -4,
};

/** Negation words that flip the sign */
const NEGATIONS = new Set([
    'not',
    'no',
    'never',
    'neither',
    'nor',
    "n't",
    'without',
    'hardly',
    'barely',
]);

interface SentimentResult {
    score: number; // Raw sum, normalised to [-1, 1]
    label: 'positive' | 'negative' | 'neutral';
    magnitude: number; // Absolute intensity 0-1
    tokens: number;
}

export function analyseSentiment(text: string): SentimentResult {
    const words = tokenise(text);
    let score = 0;
    let magnitude = 0;
    let negated = false;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (NEGATIONS.has(w)) {
            negated = true;
            continue;
        }

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

    const normalised =
        words.length > 0 ? Math.max(-1, Math.min(1, score / (words.length * 0.5))) : 0;
    const normMagnitude = words.length > 0 ? Math.min(1, magnitude / (words.length * 0.3)) : 0;

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
    const punctScore =
        (sentence.match(/!/g)?.length ?? 0) * 0.2 + (sentence.match(/\?/g)?.length ?? 0) * 0.1;

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
    'mr',
    'mrs',
    'miss',
    'ms',
    'dr',
    'prof',
    'lord',
    'lady',
    'sir',
    'master',
    'captain',
    'general',
    'king',
    'queen',
    'prince',
    'princess',
]);

const GLOBAL_STOP_WORDS = new Set([
    'the',
    'he',
    'she',
    'it',
    'they',
    'a',
    'an',
    'in',
    'on',
    'at',
    'by',
    'to',
    'of',
    'and',
    'but',
    'or',
    'not',
    'so',
    'as',
    'if',
    'up',
    'no',
    'go',
    'my',
    'we',
    'you',
    'his',
    'her',
    'our',
    'its',
    'then',
    'when',
    'what',
    'with',
    'for',
    'that',
    'this',
    'from',
    'was',
    'had',
    'are',
    'can',
    'all',
    'now',
    'still',
    'just',
    'here',
    'there',
    'could',
    'would',
    'should',
    'some',
    'into',
    'over',
    'before',
    'after',
    'more',
    'even',
    'chapter',
    'part',
    'volume',
    'section',
    'book',
    'episode',
    'page',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'first',
    'second',
    'third',
    'last',
    'next',
    'back',
    'down',
    'said',
    'asked',
    'replied',
    'answered',
    'looked',
    'turned',
    'walked',
    'came',
    'went',
    'got',
    'made',
    'knew',
    'thought',
    'felt',
    'heard',
    'saw',
    'told',
]);

export interface NamedCharacter {
    name: string;
    frequency: number;
    firstContext: string;
    sentiment: number; // avg sentiment of sentences containing this character
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
        const honorificPat =
            /\b(Mr|Mrs|Miss|Ms|Dr|Prof|Lord|Lady|Sir|Master|Captain|General|King|Queen|Prince|Princess)\.?\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g;
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
                ? v.contexts[0].length > 120
                    ? v.contexts[0].substring(0, 120) + '\u2026'
                    : v.contexts[0]
                : '',
            sentiment: v.count > 0 ? parseFloat((v.sentimentSum / v.count).toFixed(3)) : 0,
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
    threshold = 0.2,
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
            if (
                boundaries.length === 0 ||
                i - boundaries[boundaries.length - 1].startIndex >= windowSize
            ) {
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
    fleschKincaid: number; // grade level (US school grade)
    readingEase: number; // 0-100 (higher = easier)
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
    label: string; // e.g. "College", "High School"
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
        return {
            fleschKincaid: 0,
            readingEase: 100,
            avgWordsPerSentence: 0,
            avgSyllablesPerWord: 0,
            label: 'N/A',
        };
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
    'been',
    'being',
    'does',
    'did',
    'has',
    'have',
    'having',
    'will',
    'shall',
    'very',
    'much',
    'only',
    'also',
    'too',
    'like',
    'well',
    'way',
    'than',
    'each',
    'every',
    'such',
    'both',
    'own',
    'same',
    'about',
    'through',
    'during',
    'against',
    'between',
    'under',
    'above',
    'once',
    'again',
    'other',
    'any',
    'many',
    'few',
    'most',
    'along',
    'around',
    'upon',
    'while',
    'until',
    'since',
    'though',
    'because',
    'enough',
    'almost',
    'already',
    'often',
    'perhaps',
    'really',
    'quite',
    'might',
    'must',
    'shall',
    'may',
    'let',
    'yet',
    'seem',
    'seemed',
    'seems',
]);

export interface Keyword {
    word: string;
    score: number; // TF-IDF score, normalised 0-1
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
    ttr: number; // Type-Token Ratio (0-1)
    uniqueWords: number;
    totalWords: number;
    label: string; // "Rich", "Moderate", "Simple"
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
    shortSentenceRatio: number; // % of sentences under 8 words
    longSentenceRatio: number; // % of sentences over 25 words
    dialogueRatio: number; // % of panels that are dialogue
    sceneCount: number;
    label: 'Fast' | 'Moderate' | 'Slow';
}

export function analysePacing(text: string, panels: Array<{ type: string }> = []): PacingResult {
    const sentences = splitSentences(text);
    if (sentences.length === 0) {
        return {
            avgSentenceLength: 0,
            shortSentenceRatio: 0,
            longSentenceRatio: 0,
            dialogueRatio: 0,
            sceneCount: 0,
            label: 'Moderate',
        };
    }

    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avg = lengths.reduce((s, v) => s + v, 0) / lengths.length;
    const short = lengths.filter(l => l < 8).length / lengths.length;
    const long = lengths.filter(l => l > 25).length / lengths.length;
    const dialogueCount = panels.filter(p => p.type === 'dialogue').length;
    const dialogueRatio = panels.length > 0 ? dialogueCount / panels.length : 0;
    const boundaries = detectSceneBoundaries(sentences, 4, 0.2);

    // Fast pacing = short sentences + high dialogue + many scene changes
    const pacingScore =
        short * 0.4 + dialogueRatio * 0.3 + Math.min(1, boundaries.length / 10) * 0.3;
    const label: PacingResult['label'] =
        pacingScore > 0.45 ? 'Fast' : pacingScore > 0.25 ? 'Moderate' : 'Slow';

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
    position: number; // 0-100 percentage through the text
    sentiment: number; // -1 to 1
    tension: number; // 0 to 1
}

/**
 * Computes a smoothed emotional arc by sampling sentiment & tension
 * at regular intervals through the text. Returns ~20 data points.
 */
export function computeEmotionalArc(
    panels: Array<{ content: string; tension: number; sentiment: number }>,
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
        if (sentence.includes(':') || sentence.includes('\u2014')) score += 0.05;

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
