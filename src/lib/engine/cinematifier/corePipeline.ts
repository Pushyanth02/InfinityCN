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
    dialogueRatio: number;
    shortLineCount: number;
    readabilityScore: number;
    tensionScore: number;
    emotionalCharge: number;
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
// Paragraphs above this size are split into smaller cinematic units for readability.
const DENSE_PARAGRAPH_WORD_THRESHOLD = 55;
// Narrative chunks are capped around this size to prevent dense walls of text.
const DENSE_SENTENCE_WORD_THRESHOLD = 22;
// Very short or emphatic lines are isolated as dramatic beats.
const DRAMATIC_WORD_THRESHOLD = 5;
const EMOTIONAL_BEAT_SENTIMENT_THRESHOLD = 0.45;
const DIALOGUE_FRAGMENT_RE = /(?:"[^"\n]+"|“[^”\n]+”)/g;
const REFLECTION_CUES =
    /\b(thought|wondered|remembered|regretted|realized|knew|felt|hoped|feared|asked\s+(?:himself|herself|themself)|inside|within)\b/i;
const SFX_CANDIDATES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
    { pattern: /\bgunshot|shot\b/i, label: 'gunshot' },
    { pattern: /\bthunder\b/i, label: 'thunder' },
    { pattern: /\bexplosion|blast\b/i, label: 'explosion' },
    { pattern: /\bcrash|shatter(?:ed|ing)?\b/i, label: 'crash' },
    { pattern: /\bslam(?:med|ming)?\b/i, label: 'door slam' },
    { pattern: /\bfootsteps?\b/i, label: 'footsteps' },
    { pattern: /\bsiren(?:s)?\b/i, label: 'siren' },
    { pattern: /\bwind\b/i, label: 'wind' },
    { pattern: /\bcreak(?:ed|ing)?\b/i, label: 'creak' },
];
const AMBIENCE_CANDIDATES: ReadonlyArray<{ pattern: RegExp; label: string }> = [
    { pattern: /\brain|drizzle|storm\b/i, label: 'rain' },
    { pattern: /\bwind|gust\b/i, label: 'wind' },
    { pattern: /\bthunder\b/i, label: 'thunder' },
    { pattern: /\bforest|woods|trees\b/i, label: 'forest' },
    { pattern: /\bcity|street|traffic|crowd\b/i, label: 'city' },
    { pattern: /\bsilence|silent|quiet\b/i, label: 'silence' },
    { pattern: /\bocean|sea|waves\b/i, label: 'ocean' },
    { pattern: /\bfire|flame|embers\b/i, label: 'fire' },
];
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

function canonicalWithoutWhitespace(text: string): string {
    return text.replace(/\s+/g, '');
}

function normalizeSceneWhitespace(scene: string): string {
    return scene
        .replace(/\r\n|\r/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ ]+/g, '\n')
        .replace(/[ ]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function breakSentenceIntoShortLines(sentence: string): string {
    const maxWords = 6;
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

function shouldIsolateSentence(sentence: string, sceneTensionScore: number): boolean {
    if (isDramaticSentence(sentence)) return true;

    const wordCount = countWords(sentence);
    const sentiment = analyzeSentiment(sentence);
    const emotionallyCharged = Math.abs(sentiment.score) >= EMOTIONAL_BEAT_SENTIMENT_THRESHOLD;

    return emotionallyCharged && (wordCount <= 12 || sceneTensionScore >= 55);
}

function chunkNarrativeSentences(sentences: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentWordCount = 0;
    let previousSentiment: number | null = null;

    for (const sentence of sentences) {
        const words = countWords(sentence);
        const sentenceSentiment = analyzeSentiment(sentence).score;
        const emotionalShift =
            previousSentiment !== null &&
            Math.abs(sentenceSentiment - previousSentiment) >= EMOTIONAL_BEAT_SENTIMENT_THRESHOLD;
        const nextWouldBeDense =
            currentChunk.length >= 2 ||
            currentWordCount + words > DENSE_SENTENCE_WORD_THRESHOLD ||
            emotionalShift;

        if (currentChunk.length > 0 && nextWouldBeDense) {
            chunks.push(currentChunk.join(' '));
            currentChunk = [];
            currentWordCount = 0;
        }

        currentChunk.push(sentence);
        currentWordCount += words;
        previousSentiment = sentenceSentiment;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
}

function separateDialogue(text: string): string {
    return text.replace(/(["”])\s+(?=["“])/g, '$1\n').replace(SPEECH_ATTRIBUTION_PATTERN, '$1\n$2');
}

function splitParagraphByDialogue(
    paragraph: string,
): Array<{ type: 'dialogue' | 'narration'; text: string }> {
    const parts: Array<{ type: 'dialogue' | 'narration'; text: string }> = [];
    let cursor = 0;

    for (const match of paragraph.matchAll(DIALOGUE_FRAGMENT_RE)) {
        const index = match.index ?? 0;
        const dialogue = match[0].trim();
        const before = paragraph.slice(cursor, index).trim();

        if (before) {
            parts.push({ type: 'narration', text: before });
        }
        if (dialogue) {
            parts.push({ type: 'dialogue', text: dialogue });
        }

        cursor = index + dialogue.length;
    }

    const trailing = paragraph.slice(cursor).trim();
    if (trailing) {
        parts.push({ type: 'narration', text: trailing });
    }

    return parts.length > 0 ? parts : [{ type: 'narration', text: paragraph.trim() }];
}

function scoreTension(sceneText: string, shortLineCount: number): number {
    const cueMatches = [...sceneText.matchAll(new RegExp(TENSION_CUES.source, 'gi'))].length;
    const exclamations = (sceneText.match(/!/g) || []).length;
    const sentiment = analyzeSentiment(sceneText);

    const score =
        cueMatches * 14 + exclamations * 4 + Math.abs(sentiment.score) * 35 + shortLineCount * 3;

    return Math.round(clamp(score, 0, 100));
}

function detectSfxLabel(text: string): string | null {
    for (const candidate of SFX_CANDIDATES) {
        if (candidate.pattern.test(text)) {
            return candidate.label;
        }
    }
    return null;
}

function detectAmbienceLabel(text: string): string | null {
    for (const candidate of AMBIENCE_CANDIDATES) {
        if (candidate.pattern.test(text)) {
            return candidate.label;
        }
    }
    return null;
}

function selectCameraCue(analysis: SceneAnalysis): string {
    if (analysis.tensionScore >= 75) return 'HANDHELD CLOSE';
    if (analysis.dialogueRatio >= 0.45) return 'OVER THE SHOULDER';
    if (analysis.readabilityScore < 45) return 'PUSH IN';
    if (analysis.tensionScore <= 25) return 'WIDE ESTABLISHING';
    return 'MEDIUM TRACKING';
}

function selectTransitionCue(
    previous: SceneAnalysis | null,
    current: SceneAnalysis,
): 'CUT TO' | 'DISSOLVE TO' | 'SMASH CUT' | 'FADE TO BLACK' | null {
    if (!previous) return null;

    const tensionDelta = current.tensionScore - previous.tensionScore;
    if (tensionDelta >= 18) return 'SMASH CUT';
    if (tensionDelta <= -24) return 'FADE TO BLACK';

    const emotionDelta = Math.abs(current.emotionalCharge - previous.emotionalCharge);
    if (emotionDelta >= 0.35) return 'DISSOLVE TO';

    return 'CUT TO';
}

function normalizeSceneTagTitle(title: string): string {
    const compact = title.replace(/\s+/g, ' ').trim();
    if (!compact) return 'SCENE';
    return compact.replace(/\[|\]/g, '').slice(0, 72);
}

function decorateCinematicScene(
    sceneTitle: string,
    originalText: string,
    cinematizedText: string,
    analysis: SceneAnalysis,
    options: {
        transitionCue?: 'CUT TO' | 'DISSOLVE TO' | 'SMASH CUT' | 'FADE TO BLACK' | null;
    } = {},
): string {
    const cleanedOutput = cinematizedText.trim();
    if (!cleanedOutput) {
        return `[SCENE: ${normalizeSceneTagTitle(sceneTitle)}]`;
    }

    const sections = splitParagraphs(cleanedOutput);
    if (sections.length === 0) {
        return `[SCENE: ${normalizeSceneTagTitle(sceneTitle)}]\n\n${cleanedOutput}`;
    }

    const tensionIndex =
        analysis.tensionScore >= 68
            ? sections.findIndex(section => TENSION_CUES.test(section) || /!/.test(section))
            : -1;

    const reflectionIndex =
        tensionIndex === -1 && analysis.tensionScore <= 60
            ? sections.findIndex(section => REFLECTION_CUES.test(section))
            : -1;

    if (tensionIndex >= 0) {
        sections[tensionIndex] = `[TENSION]\n${sections[tensionIndex]}\n[/TENSION]`;
    } else if (reflectionIndex >= 0) {
        sections[reflectionIndex] = `[REFLECTION]\n${sections[reflectionIndex]}\n[/REFLECTION]`;
    }

    const blocks: string[] = [];
    if (options.transitionCue) {
        blocks.push(`[TRANSITION: ${options.transitionCue}]`);
    }
    blocks.push(`[SCENE: ${normalizeSceneTagTitle(sceneTitle)}]`);
    blocks.push(`[CAMERA: ${selectCameraCue(analysis)}]`);

    const ambienceLabel = detectAmbienceLabel(originalText);
    if (ambienceLabel) {
        blocks.push(`[AMBIENCE: ${ambienceLabel}]`);
    }

    const sfxLabel = detectSfxLabel(originalText);
    if (sfxLabel) {
        blocks.push(`[SFX: ${sfxLabel}]`);
    }

    blocks.push(sections.join('\n\n'));
    return blocks.join('\n\n');
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
    const dialogueRatio = lines.length > 0 ? dialogueLineCount / lines.length : 0;
    const emotionalCharge = Math.abs(analyzeSentiment(text).score);

    return {
        wordCount: readability.wordCount,
        sentenceCount: readability.sentenceCount,
        dialogueLineCount,
        dialogueRatio,
        shortLineCount,
        readabilityScore: readability.fleschReadingEase,
        tensionScore,
        emotionalCharge,
    };
}

/**
 * Apply deterministic tension-aware line/paragraph formatting.
 * - High tension: short lines
 * - Low tension: normal paragraphs
 * - Suspense band: isolate sentences
 */
export function applyTensionFormatting(text: string, tension: number): string {
    const normalized = normalizeSceneWhitespace(text);
    if (!normalized) return '';

    const clampedTension = clamp(tension, 0, 100);
    const paragraphs = splitParagraphs(normalized);
    const formattedUnits: string[] = [];

    for (const paragraph of paragraphs) {
        const sentences = splitSentencesPreservingText(paragraph)
            .map(sentence => sentence.trim())
            .filter(Boolean);

        if (sentences.length === 0) continue;

        if (clampedTension >= 70) {
            for (const sentence of sentences) {
                formattedUnits.push(breakSentenceIntoShortLines(sentence));
            }
            continue;
        }

        if (clampedTension <= 35) {
            formattedUnits.push(sentences.join(' '));
            continue;
        }

        // Suspense range: isolate each sentence for heightened readability.
        formattedUnits.push(...sentences);
    }

    const candidate = formattedUnits
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (canonicalWithoutWhitespace(candidate) === canonicalWithoutWhitespace(normalized)) {
        return candidate;
    }

    return normalized;
}

export function cinematizeScene(scene: string): string {
    const normalizedScene = normalizeSceneWhitespace(scene);
    const rebuilt = reconstructParagraphs(normalizedScene)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const analysis = analyzeScene(rebuilt);

    const paragraphs = splitParagraphs(rebuilt);
    const cinematicUnits: string[] = [];
    const shouldAddTensionSpacing = analysis.tensionScore >= 55;

    for (const paragraph of paragraphs) {
        const fragments = splitParagraphByDialogue(paragraph);

        for (const fragment of fragments) {
            if (fragment.type === 'dialogue') {
                cinematicUnits.push(fragment.text);
                continue;
            }

            const sentences = splitSentencesPreservingText(fragment.text);
            if (sentences.length === 0) {
                cinematicUnits.push(fragment.text.trim());
                continue;
            }

            const narrativeBuffer: string[] = [];

            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (!trimmed) continue;

                if (shouldIsolateSentence(trimmed, analysis.tensionScore)) {
                    if (narrativeBuffer.length > 0) {
                        cinematicUnits.push(...chunkNarrativeSentences(narrativeBuffer));
                        narrativeBuffer.length = 0;
                    }

                    cinematicUnits.push(
                        shouldAddTensionSpacing ? breakSentenceIntoShortLines(trimmed) : trimmed,
                    );
                    continue;
                }

                narrativeBuffer.push(trimmed);
            }

            if (narrativeBuffer.length > 0) {
                const denseParagraph = countWords(fragment.text) >= DENSE_PARAGRAPH_WORD_THRESHOLD;
                if (denseParagraph || shouldAddTensionSpacing) {
                    cinematicUnits.push(...chunkNarrativeSentences(narrativeBuffer));
                } else {
                    cinematicUnits.push(narrativeBuffer.join(' '));
                }
            }
        }
    }

    const candidate = cinematicUnits
        .join('\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (canonicalWithoutWhitespace(candidate) === canonicalWithoutWhitespace(rebuilt)) {
        return candidate;
    }

    const fallback = separateDialogue(rebuilt)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (canonicalWithoutWhitespace(fallback) === canonicalWithoutWhitespace(rebuilt)) {
        return fallback;
    }

    return rebuilt;
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

    let previousAnalysis: SceneAnalysis | null = null;
    const sceneResults = scenes.map(scene => {
        const analysis = analyzeScene(scene.text);
        const transitionCue = selectTransitionCue(previousAnalysis, analysis);
        const baseCinematizedText = cinematizeScene(scene.text);
        const cinematizedText = decorateCinematicScene(
            scene.title,
            scene.text,
            baseCinematizedText,
            analysis,
            { transitionCue },
        );

        previousAnalysis = analysis;

        return {
            scene,
            analysis,
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
