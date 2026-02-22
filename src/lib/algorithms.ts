/**
 * algorithms.ts — InfinityCN Core NLP & Analytics Engine
 *
 * All pure functions. No external dependencies.
 * Implements: TF-IDF, TextRank, AFINN Sentiment, Flesch-Kincaid,
 *             Vocabulary Richness (TTR/MTLD), Tension Scoring,
 *             Scene Segmentation, Named Entity Recognition.
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

/** Count syllables in a word (approximation via vowel group counting) */
export function countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
}

/** Split text into sentences */
export function splitSentences(text: string): string[] {
    return text
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 5);
}

// ═══════════════════════════════════════════════════════════
// 2. TF-IDF
// ═══════════════════════════════════════════════════════════

type TfIdfDoc = Map<string, number>;

function termFrequency(tokens: string[]): TfIdfDoc {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const total = tokens.length;
    tf.forEach((v, k) => tf.set(k, v / total));
    return tf;
}

function inverseDocumentFrequency(corpus: string[][]): Map<string, number> {
    const N = corpus.length;
    const df = new Map<string, number>();
    for (const doc of corpus) {
        const seen = new Set(doc);
        for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
    }
    const idf = new Map<string, number>();
    df.forEach((count, term) => idf.set(term, Math.log((N + 1) / (count + 1)) + 1));
    return idf;
}

export interface TfIdfResult {
    term: string;
    score: number;
}

/**
 * Compute TF-IDF scores for all terms in all sentences.
 * Returns top N terms per sentence.
 */
export function computeTfIdf(sentences: string[], topN = 10): TfIdfResult[][] {
    const tokenised = sentences.map(tokenise);
    const idf = inverseDocumentFrequency(tokenised);
    return tokenised.map(tokens => {
        const tf = termFrequency(tokens);
        const scores: TfIdfResult[] = [];
        tf.forEach((tfVal, term) => {
            scores.push({ term, score: tfVal * (idf.get(term) ?? 1) });
        });
        return scores.sort((a, b) => b.score - a.score).slice(0, topN);
    });
}

// ═══════════════════════════════════════════════════════════
// 3. TEXTRANK — Extractive Summarisation
// ═══════════════════════════════════════════════════════════

function cosineSimilarity(a: TfIdfDoc, b: TfIdfDoc): number {
    let dot = 0, normA = 0, normB = 0;
    a.forEach((va, term) => {
        const vb = b.get(term) ?? 0;
        dot += va * vb;
        normA += va * va;
    });
    b.forEach(vb => { normB += vb * vb; });
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

function pageRank(
    graph: number[][],
    damping = 0.85,
    iterations = 30,
    tolerance = 1e-5
): number[] {
    const n = graph.length;
    let scores = new Array(n).fill(1 / n);

    // Pre-compute outgoing weight sums per node (was inside inner loop → O(n³))
    const outSums = graph.map(row => row.reduce((s, v) => s + v, 0) || 1);

    for (let iter = 0; iter < iterations; iter++) {
        const newScores = new Array(n).fill((1 - damping) / n);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i !== j && graph[j][i] > 0) {
                    newScores[i] += damping * scores[j] * (graph[j][i] / outSums[j]);
                }
            }
        }
        const delta = newScores.reduce((s, v, i) => s + Math.abs(v - scores[i]), 0);
        scores = newScores;
        if (delta < tolerance) break;
    }
    return scores;
}

export interface TextRankResult {
    summary: string;
    sentences: Array<{ text: string; score: number; index: number }>;
}

/**
 * TextRank summarisation.
 * Returns top N sentences preserving original order.
 */
export function textRankSummarise(text: string, topN = 4): TextRankResult {
    const sentences = splitSentences(text).filter(s => s.split(' ').length > 5);
    if (sentences.length <= topN) {
        return {
            summary: sentences.join(' '),
            sentences: sentences.map((text, index) => ({ text, score: 1, index }))
        };
    }

    const tfDocs = sentences.map(s => termFrequency(tokenise(s)));

    // Build similarity matrix
    const matrix: number[][] = Array.from({ length: sentences.length }, () =>
        new Array(sentences.length).fill(0)
    );
    for (let i = 0; i < sentences.length; i++) {
        for (let j = 0; j < sentences.length; j++) {
            if (i !== j) {
                matrix[i][j] = cosineSimilarity(tfDocs[i], tfDocs[j]);
            }
        }
    }

    const scores = pageRank(matrix);
    const ranked = scores
        .map((score, index) => ({ text: sentences[index], score, index }))
        .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, topN).sort((a, b) => a.index - b.index);
    return {
        summary: top.map(s => s.text).join(' ... '),
        sentences: ranked,
    };
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

export interface SentimentResult {
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
export function computeEmotionalArc(sentences: string[]): number[] {
    return sentences.map(s => analyseSentiment(s).score);
}

// ═══════════════════════════════════════════════════════════
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
// 6. FLESCH-KINCAID READABILITY
// ═══════════════════════════════════════════════════════════

export interface ReadabilityResult {
    /** Flesch Reading Ease 0-100 (higher = easier) */
    fleschEase: number;
    /** Flesch-Kincaid Grade Level */
    gradeLevel: number;
    /** Human-readable label */
    label: string;
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
}

export function computeReadability(text: string): ReadabilityResult {
    const sentences = splitSentences(text);
    const words = tokenise(text).filter(w => /[a-z]/.test(w));

    const sentenceCount = Math.max(1, sentences.length);
    const wordCount = Math.max(1, words.length);
    const syllableCount = words.reduce((s, w) => s + countSyllables(w), 0);

    const asl = wordCount / sentenceCount;   // avg sentence length
    const asw = syllableCount / wordCount;   // avg syllables per word

    const fre = 206.835 - 1.015 * asl - 84.6 * asw;
    const fkgl = 0.39 * asl + 11.8 * asw - 15.59;

    const clampedFre = Math.max(0, Math.min(100, fre));
    const label =
        clampedFre >= 90 ? 'Very Easy' :
            clampedFre >= 70 ? 'Easy' :
                clampedFre >= 60 ? 'Standard' :
                    clampedFre >= 50 ? 'Fairly Difficult' :
                        clampedFre >= 30 ? 'Difficult' :
                            'Very Difficult';

    return {
        fleschEase: parseFloat(clampedFre.toFixed(1)),
        gradeLevel: parseFloat(Math.max(1, fkgl).toFixed(1)),
        label,
        wordCount,
        sentenceCount,
        avgWordsPerSentence: parseFloat(asl.toFixed(1)),
        avgSyllablesPerWord: parseFloat(asw.toFixed(2)),
    };
}

/** Estimate reading time in minutes at 200 wpm */
export function estimateReadingTime(wordCount: number): number {
    return Math.ceil(wordCount / 200);
}

// ═══════════════════════════════════════════════════════════
// 7. VOCABULARY RICHNESS — TTR & MTLD
// ═══════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'our', 'their', 'this', 'that', 'these', 'those', 'as', 'if',
    'by', 'from', 'into', 'up', 'out', 'about', 'so', 'then', 'than', 'not', 'no',
    'just', 'also', 'would', 'could', 'should', 'will', 'shall', 'may', 'might',
    'said', 'says', 'say', 'get', 'got', 'go', 'went', 'come', 'came',
]);

export interface VocabularyResult {
    /** Type-Token Ratio: unique/total (0-1) */
    ttr: number;
    /** Moving Average TTR (less sensitive to text length) */
    mattr: number;
    /** Total unique lemmas (approximate) */
    uniqueWords: number;
    totalWords: number;
    richness: 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';
}

/** Moving Average TTR using window of 50 tokens — O(n) rolling window */
function computeMATTR(tokens: string[], windowSize = 50): number {
    if (tokens.length < windowSize) {
        return tokens.length > 0
            ? new Set(tokens).size / tokens.length
            : 0;
    }
    // Rolling frequency counter for O(n) complexity
    const freq = new Map<string, number>();
    let uniqueCount = 0;
    let total = 0;

    // Seed the first window
    for (let i = 0; i < windowSize; i++) {
        const t = tokens[i];
        const c = freq.get(t) ?? 0;
        if (c === 0) uniqueCount++;
        freq.set(t, c + 1);
    }
    total += uniqueCount / windowSize;

    // Slide the window
    for (let i = 1; i <= tokens.length - windowSize; i++) {
        // Remove outgoing token
        const out = tokens[i - 1];
        const outC = freq.get(out)! - 1;
        freq.set(out, outC);
        if (outC === 0) uniqueCount--;

        // Add incoming token
        const inc = tokens[i + windowSize - 1];
        const incC = freq.get(inc) ?? 0;
        if (incC === 0) uniqueCount++;
        freq.set(inc, incC + 1);

        total += uniqueCount / windowSize;
    }
    return total / (tokens.length - windowSize + 1);
}

export function computeVocabularyRichness(text: string): VocabularyResult {
    const allTokens = tokenise(text).filter(w => !STOP_WORDS.has(w) && w.length > 2);
    const totalWords = allTokens.length;
    if (totalWords === 0) {
        return { ttr: 0, mattr: 0, uniqueWords: 0, totalWords: 0, richness: 'Very Low' };
    }

    const uniqueWords = new Set(allTokens).size;
    const ttr = uniqueWords / totalWords;
    const mattr = computeMATTR(allTokens, 50);

    const richness: VocabularyResult['richness'] =
        mattr >= 0.8 ? 'Very High' :
            mattr >= 0.65 ? 'High' :
                mattr >= 0.5 ? 'Moderate' :
                    mattr >= 0.35 ? 'Low' :
                        'Very Low';

    return {
        ttr: parseFloat(ttr.toFixed(4)),
        mattr: parseFloat(mattr.toFixed(4)),
        uniqueWords,
        totalWords,
        richness,
    };
}

// ═══════════════════════════════════════════════════════════
// 8. SCENE SEGMENTATION — TextTiling-inspired
// ═══════════════════════════════════════════════════════════

export interface SceneBoundary {
    /** sentence index where this scene starts */
    startIndex: number;
    /** depth score of the valley (higher = more significant boundary) */
    depth: number;
}

/**
 * Detect scene boundaries using a sliding vocabulary coherence window.
 * Low coherence between adjacent windows signals a topic shift.
 */
export function detectSceneBoundaries(
    sentences: string[],
    windowSize = 4,
    threshold = 0.2
): SceneBoundary[] {
    if (sentences.length < windowSize * 2) return [];

    const tokenised = sentences.map(s =>
        new Set(tokenise(s).filter(w => !STOP_WORDS.has(w) && w.length > 2))
    );

    // Compute lexical cohesion score between position i and i+1
    const cohesion: number[] = [];
    for (let i = windowSize; i < sentences.length - windowSize; i++) {
        const leftWords = new Set<string>();
        const rightWords = new Set<string>();
        for (let k = i - windowSize; k < i; k++) tokenised[k].forEach(w => leftWords.add(w));
        for (let k = i; k < i + windowSize; k++) tokenised[k].forEach(w => rightWords.add(w));

        const intersection = [...leftWords].filter(w => rightWords.has(w)).length;
        const union = leftWords.size + rightWords.size - intersection;
        cohesion.push(union > 0 ? intersection / union : 0);
    }

    // Find local minima in cohesion (valleys = scene breaks)
    const boundaries: SceneBoundary[] = [];
    for (let i = 1; i < cohesion.length - 1; i++) {
        if (cohesion[i] < cohesion[i - 1] && cohesion[i] < cohesion[i + 1]) {
            const depth = (cohesion[i - 1] - cohesion[i] + cohesion[i + 1] - cohesion[i]) / 2;
            if (depth >= threshold) {
                boundaries.push({ startIndex: i + windowSize, depth: parseFloat(depth.toFixed(4)) });
            }
        }
    }

    return boundaries;
}

// ═══════════════════════════════════════════════════════════
// 9. PACING ANALYSIS
// ═══════════════════════════════════════════════════════════

export type PacingLabel = 'breakneck' | 'brisk' | 'measured' | 'contemplative' | 'languid';

export interface PacingResult {
    label: PacingLabel;
    dialogueRatio: number;        // 0-1: how much is dialogue
    narrationRatio: number;       // 0-1: how much is narration
    avgTension: number;           // 0-1: mean tension across panels
    peakTensionIndex: number;     // index of highest tension panel
    dominantSentiment: 'positive' | 'negative' | 'neutral';
    emotionalSwings: number;      // count of sign-changes in arc
}

export function analysePacing(
    panels: Array<{ type: string; content: string; tension?: number }>
): PacingResult {
    const dialogueCount = panels.filter(p => p.type === 'dialogue').length;
    const total = panels.length || 1;

    const tensions = panels.map(p => p.tension ?? scoreTension(p.content));
    const avgTension = tensions.reduce((s, v) => s + v, 0) / tensions.length;
    const peakTensionIndex = tensions.indexOf(Math.max(...tensions));

    const sentiments = panels.map(p =>
        (p as { sentiment?: number }).sentiment ?? analyseSentiment(p.content).score
    );
    const posCounts = sentiments.filter(s => s > 0).length;
    const negCounts = sentiments.filter(s => s < 0).length;
    const dominantSentiment = posCounts > negCounts ? 'positive' :
        negCounts > posCounts ? 'negative' : 'neutral';

    // Count sentiment sign changes (emotional volatility)
    let swings = 0;
    for (let i = 1; i < sentiments.length; i++) {
        if ((sentiments[i] > 0 && sentiments[i - 1] < 0) ||
            (sentiments[i] < 0 && sentiments[i - 1] > 0)) swings++;
    }

    // Pacing label from tension + dialogue ratio
    const dialogueRatio = dialogueCount / total;
    const label: PacingLabel =
        avgTension > 0.6 && dialogueRatio > 0.5 ? 'breakneck' :
            avgTension > 0.4 ? 'brisk' :
                dialogueRatio > 0.5 ? 'measured' :
                    avgTension < 0.15 ? 'languid' :
                        'contemplative';

    return {
        label,
        dialogueRatio: parseFloat(dialogueRatio.toFixed(3)),
        narrationRatio: parseFloat((1 - dialogueRatio).toFixed(3)),
        avgTension: parseFloat(avgTension.toFixed(4)),
        peakTensionIndex,
        dominantSentiment,
        emotionalSwings: swings,
    };
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
// 11. COMPREHENSIVE TEXT ANALYTICS (Top-level orchestrator)
// ═══════════════════════════════════════════════════════════

export interface TextAnalytics {
    readability: ReadabilityResult;
    vocabulary: VocabularyResult;
    estimatedReadingTime: number;
    overallSentiment: SentimentResult;
    emotionalArc: number[];          // per-sentence sentiment scores
    sceneBoundaries: SceneBoundary[];
    textRankSummary: string;
}

/**
 * Run all document-level analytics on raw text.
 * Designed to be called once per chapter.
 */
export function analyseDocument(text: string): TextAnalytics {
    // Cache sentence split — used by 3+ sub-algorithms
    const sentences = splitSentences(text);
    const readability = computeReadability(text);
    const vocabulary = computeVocabularyRichness(text);
    const estimatedReadingTime = estimateReadingTime(readability.wordCount);
    const overallSentiment = analyseSentiment(text);
    const emotionalArc = computeEmotionalArc(sentences);
    const sceneBoundaries = detectSceneBoundaries(sentences);
    const { summary } = textRankSummarise(text, 4);

    return {
        readability,
        vocabulary,
        estimatedReadingTime,
        overallSentiment,
        emotionalArc,
        sceneBoundaries,
        textRankSummary: summary,
    };
}

// ═══════════════════════════════════════════════════════════
// 12. HAPAX LEGOMENA RATIO
// ═══════════════════════════════════════════════════════════

/**
 * Hapax Legomena: words that appear exactly once.
 * A high ratio indicates rich, varied vocabulary (common in literary fiction).
 */
export function computeHapaxRatio(text: string): { ratio: number; count: number; label: string } {
    const tokens = tokenise(text).filter(w => w.length > 2);
    if (tokens.length === 0) return { ratio: 0, count: 0, label: 'N/A' };

    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

    let hapaxCount = 0;
    freq.forEach(c => { if (c === 1) hapaxCount++; });

    const ratio = hapaxCount / tokens.length;
    const label = ratio > 0.6 ? 'Highly Unique' : ratio > 0.4 ? 'Varied' : ratio > 0.25 ? 'Moderate' : 'Repetitive';
    return { ratio: Math.round(ratio * 10000) / 10000, count: hapaxCount, label };
}

// ═══════════════════════════════════════════════════════════
// 13. SENTENCE COMPLEXITY INDEX
// ═══════════════════════════════════════════════════════════

/**
 * Approximate clause depth per sentence by counting subordination markers
 * (commas, semicolons, em-dashes, colons).
 */
export interface SentenceComplexityResult {
    avg: number;   // avg clauses per sentence
    max: number;   // most complex sentence's clause count
    label: 'Simple' | 'Moderate' | 'Complex' | 'Highly Complex';
}

export function computeSentenceComplexity(text: string): SentenceComplexityResult {
    const sentences = splitSentences(text);
    if (sentences.length === 0) return { avg: 1, max: 1, label: 'Simple' };

    const clauseCounts = sentences.map(s => {
        // Count subordination markers
        const commas = (s.match(/,/g) || []).length;
        const semis = (s.match(/;/g) || []).length;
        const dashes = (s.match(/[—–]/g) || []).length;
        const colons = (s.match(/:/g) || []).length;
        return 1 + commas + semis * 2 + dashes + colons;
    });

    const avg = clauseCounts.reduce((s, v) => s + v, 0) / clauseCounts.length;
    const max = Math.max(...clauseCounts);

    const label: SentenceComplexityResult['label'] =
        avg > 5 ? 'Highly Complex' :
            avg > 3 ? 'Complex' :
                avg > 1.8 ? 'Moderate' : 'Simple';

    return { avg: Math.round(avg * 100) / 100, max, label };
}

// ═══════════════════════════════════════════════════════════
// 14. PARAGRAPH RHYTHM SCORING
// ═══════════════════════════════════════════════════════════

/**
 * Measures sentence-length variance within paragraphs.
 * High variance = rhythmic, dynamic prose. Low = monotonous.
 */
export interface ParagraphRhythmResult {
    score: number;   // 0-1 normalised rhythm score
    avgVariance: number;
    label: 'Highly Rhythmic' | 'Rhythmic' | 'Steady' | 'Monotonous';
}

export function computeParagraphRhythm(text: string): ParagraphRhythmResult {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
    if (paragraphs.length === 0) return { score: 0, avgVariance: 0, label: 'Monotonous' };

    const variances: number[] = [];
    for (const para of paragraphs) {
        const sents = splitSentences(para);
        if (sents.length < 2) continue;
        const lengths = sents.map(s => s.split(/\s+/).length);
        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const variance = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length;
        variances.push(variance);
    }

    if (variances.length === 0) return { score: 0, avgVariance: 0, label: 'Monotonous' };

    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    // Normalise: variance of ~50+ is very rhythmic, 0–5 is monotonous
    const score = Math.min(1, avgVariance / 50);

    const label: ParagraphRhythmResult['label'] =
        score > 0.7 ? 'Highly Rhythmic' :
            score > 0.4 ? 'Rhythmic' :
                score > 0.15 ? 'Steady' : 'Monotonous';

    return { score: Math.round(score * 1000) / 1000, avgVariance: Math.round(avgVariance * 100) / 100, label };
}
