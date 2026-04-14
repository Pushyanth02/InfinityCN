export type ParagraphBreakerStrategy = 'sentence-cluster' | 'dialogue-pivot' | 'scene-cue';

export interface ParagraphBreakerOptions {
    maxSentencesPerParagraph?: number;
    maxWordsPerParagraph?: number;
}

export interface ParagraphBreakerResult {
    strategy: ParagraphBreakerStrategy;
    paragraphs: string[];
    confidence: number;
}

const DEFAULT_MAX_SENTENCES = 4;
const DEFAULT_MAX_WORDS = 95;

const DIALOGUE_START_RE = /^["'\u201c\u201d\u2018\u2019]/;
const SCENE_CUE_RE =
    /^(later|meanwhile|suddenly|at dawn|at dusk|at night|in the morning|in the evening|minutes later|hours later|the next day)\b/i;

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function canonicalWithoutWhitespace(text: string): string {
    return text.replace(/\s+/g, '');
}

function normalizeInput(text: string): string {
    return text
        .replace(/\r\n|\r/g, '\n')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitIntoSentences(text: string): string[] {
    const matches = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
    if (!matches) return [];

    return matches.map(sentence => sentence.trim()).filter(Boolean);
}

function scoreParagraphShape(paragraphs: string[], maxWordsPerParagraph: number): number {
    if (paragraphs.length === 0) return 0;

    const totalWords = paragraphs.reduce((sum, paragraph) => sum + countWords(paragraph), 0);
    const averageWords = totalWords / paragraphs.length;
    const targetAverage = Math.max(24, maxWordsPerParagraph * 0.55);

    const densityScore = 1 - Math.min(1, Math.abs(averageWords - targetAverage) / targetAverage);
    const paragraphCountScore = paragraphs.length <= 1 ? 0.2 : Math.min(1, paragraphs.length / 4);

    return Math.round((densityScore * 0.55 + paragraphCountScore * 0.45) * 100) / 100;
}

function clusterSentences(
    sentences: string[],
    options: Required<ParagraphBreakerOptions>,
    shouldForceBreak?: (sentence: string, previousSentence: string | null) => boolean,
): string[] {
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    let currentWords = 0;

    const flush = () => {
        if (currentParagraph.length === 0) return;
        paragraphs.push(currentParagraph.join(' ').trim());
        currentParagraph = [];
        currentWords = 0;
    };

    for (const sentence of sentences) {
        const sentenceWords = countWords(sentence);
        const previousSentence = currentParagraph[currentParagraph.length - 1] ?? null;
        const exceedsSentenceBudget = currentParagraph.length >= options.maxSentencesPerParagraph;
        const exceedsWordBudget =
            currentParagraph.length > 0 &&
            currentWords + sentenceWords > options.maxWordsPerParagraph;
        const forcedBreak = shouldForceBreak?.(sentence, previousSentence) ?? false;

        if (
            currentParagraph.length > 0 &&
            (exceedsSentenceBudget || exceedsWordBudget || forcedBreak)
        ) {
            flush();
        }

        currentParagraph.push(sentence);
        currentWords += sentenceWords;
    }

    flush();
    return paragraphs;
}

function buildResult(
    strategy: ParagraphBreakerStrategy,
    paragraphs: string[],
    maxWordsPerParagraph: number,
): ParagraphBreakerResult {
    return {
        strategy,
        paragraphs,
        confidence: scoreParagraphShape(paragraphs, maxWordsPerParagraph),
    };
}

export function runParagraphBreakerApis(
    rawText: string,
    options: ParagraphBreakerOptions = {},
): ParagraphBreakerResult[] {
    const normalized = normalizeInput(rawText);
    if (!normalized) return [];

    const config: Required<ParagraphBreakerOptions> = {
        maxSentencesPerParagraph: Math.max(
            2,
            options.maxSentencesPerParagraph ?? DEFAULT_MAX_SENTENCES,
        ),
        maxWordsPerParagraph: Math.max(32, options.maxWordsPerParagraph ?? DEFAULT_MAX_WORDS),
    };

    const sentences = splitIntoSentences(normalized);
    if (sentences.length <= 1) {
        return [
            {
                strategy: 'sentence-cluster',
                paragraphs: [normalized],
                confidence: 0.25,
            },
        ];
    }

    const sentenceCluster = clusterSentences(sentences, config);
    const dialoguePivot = clusterSentences(sentences, config, sentence =>
        DIALOGUE_START_RE.test(sentence),
    );
    const sceneCue = clusterSentences(sentences, config, sentence => SCENE_CUE_RE.test(sentence));

    return [
        buildResult('sentence-cluster', sentenceCluster, config.maxWordsPerParagraph),
        buildResult('dialogue-pivot', dialoguePivot, config.maxWordsPerParagraph),
        buildResult('scene-cue', sceneCue, config.maxWordsPerParagraph),
    ];
}

export function chooseParagraphBreakerResult(
    rawText: string,
    results: ParagraphBreakerResult[],
): ParagraphBreakerResult | null {
    const normalized = normalizeInput(rawText);
    if (!normalized) return null;

    const matching = results
        .filter(result => result.paragraphs.length > 0)
        .filter(result => {
            const rebuilt = result.paragraphs.join(' ');
            return canonicalWithoutWhitespace(rebuilt) === canonicalWithoutWhitespace(normalized);
        });

    if (matching.length === 0) return null;

    return [...matching].sort((left, right) => {
        if (Math.abs(right.confidence - left.confidence) > 0.001) {
            return right.confidence - left.confidence;
        }

        return right.paragraphs.length - left.paragraphs.length;
    })[0];
}

export function rebuildParagraphsWithBreakerApis(
    rawText: string,
    options: ParagraphBreakerOptions = {},
): string[] {
    const normalized = normalizeInput(rawText);
    if (!normalized) return [];

    const results = runParagraphBreakerApis(normalized, options);
    const chosen = chooseParagraphBreakerResult(normalized, results);

    if (!chosen) {
        return [normalized];
    }

    return chosen.paragraphs;
}
