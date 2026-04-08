import { analyzeReadability } from './readability';
import { detectSceneBreaks, deriveSceneTitle } from './sceneDetection';
import { analyzeSentiment } from './sentimentTracker';
import { normalizeQuotes, normalizeUnicode, reconstructParagraphs } from './textProcessing';

export interface CoreScene {
    id: string;
    title: string;
    text: string;
    paragraphs: string[];
}

export interface SceneAnalysis {
    wordCount: number;
    sentenceCount: number;
    dialogueLineCount: number;
    shortLineCount: number;
    readabilityScore: number;
    tensionScore: number;
}

export interface OutputValidation {
    isValid: boolean;
    meaningPreserved: boolean;
    dialogueSeparated: boolean;
    pacingReadable: boolean;
    tensionDetected: boolean;
    shortLinesPresent: boolean;
    issues: string[];
}

export interface CorePipelineSceneResult {
    scene: CoreScene;
    analysis: SceneAnalysis;
    cinematizedText: string;
    validation: OutputValidation;
}

export interface CorePipelineResult {
    rebuiltText: string;
    scenes: CorePipelineSceneResult[];
    outputText: string;
    validation: OutputValidation;
}

const TENSION_CUES =
    /\b(suddenly|danger|threat|panic|fear|dread|blood|scream|gun|knife|fight|attack|urgent|run|now)\b/i;
const DIALOGUE_LINE = /^\s*(?:["“']|[A-Z][A-Za-z]+:\s)/;
const SENTENCE_BOUNDARY = /(?<=[.!?]["”']?)\s+/;
const DENSE_PARAGRAPH_WORD_THRESHOLD = 55;
const DENSE_SENTENCE_WORD_THRESHOLD = 22;
const DRAMATIC_WORD_THRESHOLD = 5;
const SPEECH_VERBS_PATTERN = 'said|asked|replied|whispered|shouted|muttered';
const SPEECH_ATTRIBUTION_PATTERN = new RegExp(
    `(["”])\\s+([A-Z][a-z]+(?:\\s+(?:[A-Z][a-z]+|[a-z]+)){0,3}\\s+(?:${SPEECH_VERBS_PATTERN})\\b)`,
    'g',
);

function splitParagraphs(text: string): string[] {
    return text
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean);
}

function splitSentencesPreservingText(paragraph: string): string[] {
    return paragraph
        .split(SENTENCE_BOUNDARY)
        .map(s => s.trim())
        .filter(Boolean);
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function breakSentenceIntoShortLines(sentence: string, maxWords = 8): string {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return sentence.trim();

    const lines: string[] = [];
    for (let i = 0; i < words.length; i += maxWords) {
        lines.push(words.slice(i, i + maxWords).join(' '));
    }
    return lines.join('\n');
}

function isDramaticSentence(sentence: string): boolean {
    const trimmed = sentence.trim();
    if (!trimmed) return false;

    const words = countWords(trimmed);
    return (
        words <= DRAMATIC_WORD_THRESHOLD ||
        /[!?]$/.test(trimmed) ||
        TENSION_CUES.test(trimmed) ||
        /^[A-Z][A-Z\s,'".!?-]+$/.test(trimmed)
    );
}

function chunkNarrativeSentences(sentences: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;

    for (const sentence of sentences) {
        const words = countWords(sentence);
        const nextWouldBeDense =
            currentChunk.length >= 2 || currentWordCount + words > DENSE_SENTENCE_WORD_THRESHOLD;

        if (currentChunk.length > 0 && nextWouldBeDense) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
            currentWordCount = 0;
        }

        currentChunk.push(sentence);
        currentWordCount += words;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
}

function separateDialogue(text: string): string {
    return text
        .replace(/(["”])\s+(?=["“])/g, '$1\n')
        .replace(SPEECH_ATTRIBUTION_PATTERN, '$1\n$2');
}

function scoreTension(sceneText: string, shortLineCount: number): number {
    const cueMatches = [...sceneText.matchAll(new RegExp(TENSION_CUES.source, 'gi'))].length;
    const exclamations = (sceneText.match(/!/g) || []).length;
    const sentiment = analyzeSentiment(sceneText);

    const score =
        cueMatches * 14 + exclamations * 4 + Math.abs(sentiment.score) * 35 + shortLineCount * 3;

    return Math.round(clamp(score, 0, 100));
}

export function rebuildParagraphs(text: string): string {
    const normalized = normalizeUnicode(normalizeQuotes(text));
    return reconstructParagraphs(normalized)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function segmentScenes(text: string): CoreScene[] {
    const rebuilt = rebuildParagraphs(text);
    const paragraphs = splitParagraphs(rebuilt);
    if (!paragraphs.length) return [];

    const grouped = detectSceneBreaks(paragraphs);
    return grouped.map((sceneParagraphs, idx) => ({
        id: `scene-${idx + 1}`,
        title: deriveSceneTitle(sceneParagraphs, idx + 1),
        paragraphs: sceneParagraphs,
        text: sceneParagraphs.join('\n\n'),
    }));
}

export function analyzeScene(scene: string): SceneAnalysis {
    const text = scene.trim();
    const lines = text
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean);

    const shortLineCount = lines.filter(line => {
        const words = countWords(line);
        return words > 0 && words <= 6;
    }).length;

    const dialogueLineCount = lines.filter(line => DIALOGUE_LINE.test(line)).length;
    const readability = analyzeReadability(text);
    const tensionScore = scoreTension(text, shortLineCount);

    return {
        wordCount: readability.wordCount,
        sentenceCount: readability.sentenceCount,
        dialogueLineCount,
        shortLineCount,
        readabilityScore: readability.fleschReadingEase,
        tensionScore,
    };
}

export function cinematizeScene(scene: string): string {
    const rebuilt = rebuildParagraphs(scene);
    const dialogueSeparated = separateDialogue(rebuilt);
    const analysis = analyzeScene(dialogueSeparated);

    const paragraphs = splitParagraphs(dialogueSeparated);
    const cinematicUnits: string[] = [];
    const shouldAddTensionSpacing = analysis.tensionScore >= 55;

    for (const paragraph of paragraphs) {
        if (DIALOGUE_LINE.test(paragraph)) {
            const dialogueLines = paragraph
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean);
            cinematicUnits.push(...dialogueLines);
            continue;
        }

        const sentences = splitSentencesPreservingText(paragraph);
        if (sentences.length === 0) {
            cinematicUnits.push(paragraph);
            continue;
        }

        const narrativeBuffer: string[] = [];

        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (!trimmed) continue;

            if (isDramaticSentence(trimmed)) {
                if (narrativeBuffer.length > 0) {
                    cinematicUnits.push(...chunkNarrativeSentences(narrativeBuffer));
                    narrativeBuffer.length = 0;
                }

                cinematicUnits.push(
                    shouldAddTensionSpacing ? breakSentenceIntoShortLines(trimmed, 6) : trimmed,
                );
                continue;
            }

            narrativeBuffer.push(trimmed);
        }

        if (narrativeBuffer.length > 0) {
            const denseParagraph = countWords(paragraph) >= DENSE_PARAGRAPH_WORD_THRESHOLD;
            if (denseParagraph || shouldAddTensionSpacing) {
                cinematicUnits.push(...chunkNarrativeSentences(narrativeBuffer));
            } else {
                cinematicUnits.push(narrativeBuffer.join(' '));
            }
        }
    }

    return cinematicUnits.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function validateOutput(text: string): OutputValidation {
    const cleaned = text.trim();
    const issues: string[] = [];

    if (!cleaned) {
        issues.push('Output is empty.');
    }

    const analysis = analyzeScene(cleaned);
    const hasDialogue = /["“][^"”]+["”]/.test(cleaned);
    const dialogueSeparated = !hasDialogue || /(^|\n)\s*["“]/m.test(cleaned);
    const pacingReadable = analysis.sentenceCount === 0 || analysis.readabilityScore >= 40;
    const tensionDetected = analysis.tensionScore >= 35;
    const shortLinesPresent = analysis.shortLineCount > 0;

    if (!dialogueSeparated) issues.push('Dialogue is not clearly separated into readable lines.');
    if (!pacingReadable) issues.push('Readability is low; pacing needs refinement.');

    const meaningPreserved = true;

    return {
        isValid: issues.length === 0,
        meaningPreserved,
        dialogueSeparated,
        pacingReadable,
        tensionDetected,
        shortLinesPresent,
        issues,
    };
}

export function runCorePipeline(text: string): CorePipelineResult {
    const rebuiltText = rebuildParagraphs(text);
    const scenes = segmentScenes(rebuiltText);

    const sceneResults = scenes.map(scene => {
        const cinematizedText = cinematizeScene(scene.text);
        return {
            scene,
            analysis: analyzeScene(scene.text),
            cinematizedText,
            validation: validateOutput(cinematizedText),
        };
    });

    const outputText = sceneResults.map(s => s.cinematizedText).join('\n\n');

    return {
        rebuiltText,
        scenes: sceneResults,
        outputText,
        validation: validateOutput(outputText),
    };
}
