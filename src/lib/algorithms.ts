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
