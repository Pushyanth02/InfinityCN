/**
 * sentimentTracker.ts — Offline Sentiment Flow Tracker
 *
 * Provides word-level sentiment analysis using an AFINN-inspired lexicon,
 * sentence-level aggregation, and emotion transition detection.
 * Enriches the offline engine's emotion detection without requiring AI.
 *
 * Sentiment scores range from -5 (very negative) to +5 (very positive).
 * The tracker computes per-sentence flow, detects emotional shifts,
 * and maps scores to EmotionCategory values for block enrichment.
 */

import type { EmotionCategory } from '../../../types/cinematifier';

// ─── Compact Sentiment Lexicon ──────────────────────────────
// A curated and expanded subset of AFINN-111 and narrative/emotion words.
// Scores range from -5 to +5. Add more emotion-rich and literary terms.

const SENTIMENT_LEXICON: Record<string, number> = {
    // Additional literary/emotion words
    anxious: -2,
    anticipation: 1,
    awe: 2,
    betrayal: -3,
    bliss: 3,
    comforted: 2,
    despairing: -4,
    devastated: -4,
    elated: 3,
    furious: -3,
    grateful: 2,
    heartbroken: -4,
    hopeful: 2,
    melancholy: -2,
    nostalgic: 1,
    overwhelmed: -2,
    peaceful: 2,
    relieved: 2,
    resentful: -2,
    shocked: -2,
    tense: -2,
    thrilled: 3,
    uneasy: -1,
    vulnerable: -1,
    // ...existing code...
    // Very negative (-5 to -4)
    abandon: -2,
    abuse: -3,
    agony: -4,
    anger: -3,
    anguish: -4,
    annihilate: -5,
    assault: -4,
    atrocity: -5,
    betray: -3,
    bitter: -2,
    bleed: -2,
    brutal: -3,
    catastrophe: -4,
    chaos: -3,
    collapse: -3,
    corrupt: -3,
    crash: -2,
    cruel: -3,
    crush: -2,
    cry: -2,
    damn: -3,
    danger: -2,
    dark: -1,
    dead: -3,
    death: -3,
    decay: -2,
    defeat: -3,
    demon: -3,
    despair: -4,
    destroy: -3,
    devastate: -4,
    die: -3,
    disaster: -3,
    doom: -3,
    dread: -3,
    evil: -3,
    explode: -2,
    fail: -2,
    fear: -2,
    fight: -2,
    fire: -1,
    fury: -3,
    grief: -3,
    grim: -2,
    guilt: -2,
    hate: -3,
    hell: -3,
    helpless: -2,
    hopeless: -3,
    horrible: -3,
    horror: -3,
    hostile: -2,
    hurt: -2,
    imprison: -3,
    inferno: -3,
    kill: -3,
    knife: -2,
    lonely: -2,
    lose: -2,
    loss: -3,
    mad: -2,
    menace: -3,
    miserable: -3,
    mourn: -3,
    murder: -4,
    nightmare: -3,
    pain: -2,
    panic: -3,
    peril: -3,
    plague: -3,
    poison: -3,
    prison: -2,
    punish: -2,
    rage: -3,
    regret: -2,
    reject: -2,
    revenge: -2,
    ruin: -3,
    sad: -2,
    scream: -2,
    shadow: -1,
    shatter: -2,
    shock: -2,
    sin: -2,
    sob: -2,
    sorrow: -3,
    storm: -1,
    suffer: -3,
    sword: -1,
    terror: -3,
    threat: -2,
    torment: -3,
    tragic: -3,
    trap: -2,
    trauma: -4,
    treachery: -3,
    tremble: -2,
    ugly: -2,
    victim: -3,
    violence: -3,
    war: -2,
    weapon: -2,
    weep: -2,
    wicked: -3,
    wound: -2,
    wrath: -3,

    // Negative (-1 to -2)
    afraid: -2,
    argue: -1,
    bad: -2,
    bore: -1,
    broken: -2,
    cold: -1,
    confuse: -1,
    difficult: -1,
    disappoint: -2,
    doubt: -1,
    dull: -1,
    empty: -1,
    exhaust: -1,
    frown: -1,
    grave: -1,
    grey: -1,
    hard: -1,
    heavy: -1,
    ignore: -1,
    impatient: -1,
    irritate: -1,
    nervous: -1,
    odd: -1,
    poor: -1,
    problem: -1,
    rough: -1,
    struggle: -1,
    tired: -1,
    trouble: -1,
    uncertain: -1,
    unfortunate: -2,
    unhappy: -2,
    upset: -2,
    wait: -1,
    wary: -1,
    worry: -2,

    // Positive (+1 to +2)
    accept: 1,
    adventure: 1,
    agree: 1,
    alive: 1,
    amuse: 2,
    beauty: 2,
    better: 1,
    bless: 2,
    bold: 1,
    brave: 2,
    bright: 1,
    calm: 1,
    care: 1,
    cheerful: 2,
    clever: 1,
    comfort: 1,
    confidence: 2,
    cool: 1,
    courage: 2,
    creative: 1,
    curious: 1,
    dance: 1,
    delight: 2,
    dream: 1,
    eager: 1,
    easy: 1,
    enjoy: 2,
    explore: 1,
    faith: 2,
    fancy: 1,
    fine: 1,
    free: 1,
    fresh: 1,
    friend: 1,
    fun: 2,
    gentle: 1,
    gift: 1,
    glad: 2,
    gold: 1,
    good: 2,
    grace: 2,
    great: 2,
    green: 1,
    grow: 1,
    happy: 2,
    harmony: 2,
    heal: 2,
    heart: 1,
    help: 1,
    hero: 2,
    home: 1,
    honest: 2,
    hope: 2,
    hug: 2,
    imagine: 1,
    inspire: 2,
    interest: 1,
    joy: 3,
    kind: 2,
    laugh: 2,
    learn: 1,
    life: 1,
    light: 1,
    like: 1,
    love: 3,
    lucky: 2,
    magic: 2,
    marvel: 2,
    mercy: 2,
    miracle: 3,
    nice: 1,
    noble: 2,
    nurture: 1,
    paradise: 3,
    passion: 2,
    peace: 2,
    perfect: 2,
    play: 1,
    please: 1,
    pride: 1,
    promise: 1,
    protect: 1,
    pure: 2,
    quiet: 1,
    radiant: 2,
    rejoice: 3,
    relief: 2,
    rescue: 2,
    rest: 1,
    reward: 1,
    rich: 1,
    rise: 1,
    safe: 1,
    save: 1,
    shine: 1,
    sing: 1,
    smile: 2,
    soft: 1,
    star: 1,
    strength: 2,
    success: 2,
    sun: 1,
    sweet: 1,
    tender: 1,
    thank: 2,
    thrive: 2,
    together: 1,
    treasure: 2,
    triumph: 3,
    trust: 2,
    victory: 3,
    warm: 1,
    welcome: 1,
    win: 2,
    wisdom: 2,
    wish: 1,
    wonder: 2,
};

// ─── Negation Words ──────────────────────────────────────────

const NEGATION_WORDS = new Set([
    'not',
    "n't",
    'no',
    'never',
    'neither',
    'nor',
    'nobody',
    'nothing',
    'nowhere',
    'hardly',
    'scarcely',
    'barely',
    "don't",
    "doesn't",
    "didn't",
    "won't",
    "wouldn't",
    "can't",
    "couldn't",
    "shouldn't",
    "isn't",
    "aren't",
    "wasn't",
    "weren't",
]);

// ─── Intensifier Words ───────────────────────────────────────

const INTENSIFIERS: Record<string, number> = {
    very: 1.5,
    extremely: 2,
    incredibly: 2,
    absolutely: 2,
    utterly: 2,
    deeply: 1.5,
    truly: 1.3,
    really: 1.3,
    quite: 1.2,
    somewhat: 0.7,
    slightly: 0.5,
    barely: 0.3,
    almost: 0.5,
};

// ─── Sentiment Analysis ──────────────────────────────────────

export interface SentimentResult {
    /** Normalized sentiment score (-1 to 1) */
    score: number;
    /** Raw un-normalized sum */
    rawScore: number;
    /** Number of sentiment-bearing words found */
    sentimentWordCount: number;
    /** Mapped EmotionCategory */
    emotion: EmotionCategory;
    /** Confidence (0–1): how many words had sentiment vs. total */
    confidence: number;
}

export interface SentimentFlowPoint {
    /** Sentence index in the text */
    index: number;
    /** Sentiment score for this sentence */
    score: number;
    /** Emotion category */
    emotion: EmotionCategory;
    /** Whether this point represents an emotional shift */
    isShift: boolean;
}

export interface SentimentFlowResult {
    /** Overall document sentiment */
    overall: SentimentResult;
    /** Per-sentence sentiment flow */
    flow: SentimentFlowPoint[];
    /** Count of emotional shifts detected */
    shiftCount: number;
    /** Dominant emotion across the text */
    dominantEmotion: EmotionCategory;
    /** Emotional range (max - min score) */
    emotionalRange: number;
}

/**
 * Map a sentiment score to an EmotionCategory.
 */
export function scoreToEmotion(score: number): EmotionCategory {
    if (score >= 0.3) return 'joy';
    if (score >= 0.1) return 'surprise';
    if (score <= -0.4) return 'fear';
    if (score <= -0.2) return 'sadness';
    if (score <= -0.1) return 'anger';
    return 'neutral';
}

/**
 * Analyze sentiment of a single sentence or short passage.
 */
export function analyzeSentiment(text: string): SentimentResult {
    const words = text
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z'-]/g, ''))
        .filter(w => w.length > 0);

    let rawScore = 0;
    let sentimentWordCount = 0;
    let negated = false;
    let intensifier = 1;
    let lastNegationIdx = -2;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        // Check negation (negation affects next 2 words)
        if (NEGATION_WORDS.has(word)) {
            negated = true;
            lastNegationIdx = i;
            continue;
        }

        // Check intensifier
        if (INTENSIFIERS[word] !== undefined) {
            intensifier = INTENSIFIERS[word];
            continue;
        }

        // Look up sentiment
        // Try exact match, then try stripping common suffixes
        let wordScore = SENTIMENT_LEXICON[word];
        if (wordScore === undefined) {
            // Try stemming: remove -ing, -ed, -ly, -ness, -ful, -less
            const stem = word.replace(
                /(?:ing|ed|ly|ness|ful|less|ment|tion|sion|able|ible|ous|ive)$/,
                '',
            );
            if (stem.length >= 3) {
                wordScore = SENTIMENT_LEXICON[stem];
            }
        }

        if (wordScore !== undefined) {
            let adjusted = wordScore * intensifier;
            // Negation affects up to 2 words after negation word
            if (negated && i - lastNegationIdx <= 2) adjusted *= -0.75;
            rawScore += adjusted;
            sentimentWordCount++;
        }

        // Reset intensifier after each content word
        intensifier = 1;
        // Reset negation if more than 2 words after negation
        if (negated && i - lastNegationIdx >= 2) negated = false;
    }

    const totalWords = Math.max(1, words.length);
    const normalizedScore = Math.max(
        -1,
        Math.min(1, rawScore / Math.max(1, sentimentWordCount * 2)),
    );
    const confidence = sentimentWordCount / totalWords;

    // TODO: In future, call AI/ML model for sentiment if enabled

    return {
        score: Math.round(normalizedScore * 1000) / 1000,
        rawScore: Math.round(rawScore * 100) / 100,
        sentimentWordCount,
        emotion: scoreToEmotion(normalizedScore),
        confidence: Math.round(confidence * 1000) / 1000,
    };
}

/**
 * Analyze sentiment flow across a text passage.
 * Splits into sentences and tracks emotional trajectory.
 */
export function analyzeSentimentFlow(text: string): SentimentFlowResult {
    const sentences = text
        .split(/[.!?]+(?:\s|$)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (sentences.length === 0) {
        return {
            overall: analyzeSentiment(text),
            flow: [],
            shiftCount: 0,
            dominantEmotion: 'neutral',
            emotionalRange: 0,
        };
    }

    const flow: SentimentFlowPoint[] = [];
    let prevEmotion: EmotionCategory = 'neutral';
    let shiftCount = 0;
    let minScore = Infinity;
    let maxScore = -Infinity;
    const emotionCounts: Record<string, number> = {};

    for (let i = 0; i < sentences.length; i++) {
        const result = analyzeSentiment(sentences[i]);
        const isShift = i > 0 && result.emotion !== prevEmotion && result.confidence > 0.05;

        if (isShift) shiftCount++;

        flow.push({
            index: i,
            score: result.score,
            emotion: result.emotion,
            isShift,
        });

        if (result.score < minScore) minScore = result.score;
        if (result.score > maxScore) maxScore = result.score;

        emotionCounts[result.emotion] = (emotionCounts[result.emotion] || 0) + 1;
        prevEmotion = result.emotion;
    }

    // Find dominant emotion
    let dominantEmotion: EmotionCategory = 'neutral';
    let maxCount = 0;
    for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion as EmotionCategory;
        }
    }

    return {
        overall: analyzeSentiment(text),
        flow,
        shiftCount,
        dominantEmotion,
        emotionalRange: Math.round((maxScore - minScore) * 1000) / 1000,
    };
}
