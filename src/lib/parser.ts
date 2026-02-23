/**
 * parser.ts — InfinityCN Text-to-Panel Engine (V16 — Optimised)
 *
 * V15 changes:
 *  - Async time-slicing in the panel loop (yields every 50 panels)
 *  - Single-pass tension+sentiment scoring per sentence
 *  - Weighted, tiered atmosphere keyword scoring
 *  - Expanded scene-transition keywords
 *  - Improved speaker detection (said/whispered/shouted/muttered + Name)
 */
import type { MangaPanel, Character, Atmosphere } from '../types';
import {
    splitSentences,
    scoreTension,
    analyseSentiment,
    detectSceneBoundaries,
    extractCharacters,
    tokenise,
} from './algorithms';

// ─── Session epoch for stable IDs across a page load ──────
const SESSION_EPOCH = Date.now();

// ─── Speaker pattern: "said Name", "Name whispered", etc. ─
const SAID_AFTER = /(?:said|whispered|shouted|muttered|snarled|replied|called|cried|gasped|answered|snapped)\s+([A-Z][a-zA-Z]{1,20})/;
const SAID_BEFORE = /([A-Z][a-zA-Z]{1,20})\s+(?:said|whispered|shouted|muttered|snarled|replied|called|cried|gasped|answered|snapped)\b/;

// ─── Scene-transition keywords ─────────────────────────────
const TRANSITION_RE = /meanwhile|later|suddenly|elsewhere|next day|years later|hours later|moments later|the next morning|back at the|at that moment|across the city|far away|in the distance/i;

// ═══════════════════════════════════════════════════════════
// PRIMARY: TEXT → PANELS  (async, time-sliced)
// ═══════════════════════════════════════════════════════════

/** Yield to the browser event loop for `ms` milliseconds */
const yieldToMain = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const processTextToManga = async (
    text: string,
    onProgress?: (progress: number) => void
): Promise<MangaPanel[]> => {
    if (onProgress) onProgress(20);

    const sentences = splitSentences(text);
    if (onProgress) onProgress(35);

    // Pre-compute scene boundaries once
    const boundaries = detectSceneBoundaries(sentences, 4, 0.2);
    const boundarySet = new Set(boundaries.map(b => b.startIndex));
    if (onProgress) onProgress(50);

    const panels: MangaPanel[] = [];
    const CHUNK = 50; // yield every N panels to keep UI responsive

    for (let index = 0; index < sentences.length; index++) {
        // Yield to the event loop every CHUNK iterations
        if (index > 0 && index % CHUNK === 0) {
            const pct = 50 + Math.round((index / sentences.length) * 35);
            if (onProgress) onProgress(pct);
            await yieldToMain();
        }

        const sentence = sentences[index];
        let type: MangaPanel['type'] = 'narration';
        let intensity: MangaPanel['intensity'] = 'normal';
        let alignment: MangaPanel['alignment'] = 'left';
        let speaker: string | undefined;
        let quoteContent = sentence;

        // 1. Dialogue Detection — improved speaker attribution
        const quoteMatch = sentence.match(/["""''](.*?)["""'']/);
        if (quoteMatch && quoteMatch[1].length > 3) {
            type = 'dialogue';
            alignment = 'right';
            quoteContent = quoteMatch[1];

            const beforeQ = sentence.substring(0, quoteMatch.index ?? 0).trim();
            const afterQ = sentence.substring((quoteMatch.index ?? 0) + quoteMatch[0].length).trim();

            // Try "said Name" / "Name said" first (more reliable)
            const saidAfterMatch = SAID_AFTER.exec(afterQ);
            const saidBeforeMatch = SAID_BEFORE.exec(beforeQ);
            if (saidAfterMatch) speaker = saidAfterMatch[1];
            else if (saidBeforeMatch) speaker = saidBeforeMatch[1];
            else {
                // Fallback: first capitalised word in surrounding context
                const findCap = (s: string) => s.match(/\b[A-Z][a-z]{1,}/)?.[0];
                speaker = findCap(beforeQ) ?? findCap(afterQ);
            }
        }

        // 2. Sound Effect Detection
        else if (/\b[A-Z]{3,}\b/.test(sentence) && sentence.split(' ').length < 6) {
            type = 'sound_effect';
            alignment = 'center';
            intensity = 'high';
        }

        // 3. Scene Transition Detection — expanded list
        else if (TRANSITION_RE.test(sentence) && sentence.split(' ').length < 14) {
            type = 'scene_transition';
            alignment = 'center';
            intensity = 'low';
        }

        // 4. Tension + Sentiment in ONE call each, pass sentiment to scoreTension
        const sentimentResult = analyseSentiment(sentence);
        const tension = scoreTension(sentence, sentimentResult);

        if (tension > 0.55 || sentence.includes('!') || type === 'sound_effect') {
            intensity = 'high';
            if (type === 'dialogue') alignment = 'center';
        } else if (tension < 0.15 || sentence.includes('...') || sentence.length > 180) {
            intensity = 'low';
        }

        panels.push({
            id: `panel-${SESSION_EPOCH}-${index}`,
            type,
            content: type === 'dialogue' ? quoteContent : sentence,
            intensity,
            speaker,
            alignment,
            tension: parseFloat(tension.toFixed(4)),
            sentiment: sentimentResult.score,
            isSceneBoundary: boundarySet.has(index),
        });
    }

    if (onProgress) onProgress(88);
    return panels;
};

// ═══════════════════════════════════════════════════════════
// CHARACTERS — NER-powered with sentiment association
// ═══════════════════════════════════════════════════════════

export const processCharacters = async (text: string): Promise<Character[]> => {
    const found = extractCharacters(text, 10);
    return found.map(c => ({
        name: c.name,
        description: c.firstContext
            ? `First appears: "${c.firstContext}"`
            : `Appears ${c.frequency} time${c.frequency !== 1 ? 's' : ''} in the text.`,
        frequency: c.frequency,
        sentiment: c.sentiment,
        honorific: c.honorific,
    }));
};



// ═══════════════════════════════════════════════════════════
// ATMOSPHERE — Tiered weighted keyword scoring (V15)
// ═══════════════════════════════════════════════════════════

/** Word lists by tier (1 = common, 2 = specific, 3 = rare/high-signal) */
const ATMO_TIERS: Record<Atmosphere['mood'], [string[], string[], string[]]> = {
    dark_stormy: [
        ['storm', 'rain', 'dark', 'shadow', 'cold', 'blood', 'death', 'grey'],
        ['thunder', 'lightning', 'fog', 'bleak', 'dread', 'gloom', 'grim'],
        ['desolation', 'shroud', 'abyss', 'forsaken', 'wraith', 'ruin', 'elegy'],
    ],
    bright_sunny: [
        ['sun', 'bright', 'warm', 'light', 'smile', 'clear', 'blue', 'hope'],
        ['golden', 'dawn', 'cheerful', 'laugh', 'joy', 'sky', 'radiant'],
        ['luminous', 'effulgent', 'resplendent', 'rapture', 'vivid', 'gleam'],
    ],
    mysterious_fog: [
        ['mist', 'fog', 'secret', 'hidden', 'strange', 'unknown', 'ancient'],
        ['whisper', 'veil', 'shroud', 'mystery', 'ruin', 'cipher', 'omen'],
        ['inscrutable', 'enigmatic', 'otherworldly', 'esoteric', 'spectral'],
    ],
    tense_battle: [
        ['fight', 'battle', 'attack', 'kill', 'war', 'enemy', 'blood', 'wound'],
        ['sword', 'strike', 'clash', 'combat', 'shot', 'struggle', 'assault'],
        ['carnage', 'vengeance', 'havoc', 'slaughter', 'siege', 'offensive'],
    ],
    quiet_indoor: [
        ['room', 'table', 'sat', 'stood', 'inside', 'window', 'chair', 'door'],
        ['house', 'wall', 'floor', 'candle', 'fire', 'hearth', 'fireplace'],
        ['contemplation', 'stillness', 'solitude', 'lantern', 'ember', 'repose'],
    ],
    default: [[], [], []],
};

const ATMO_DESCRIPTIONS: Record<string, string> = {
    dark_stormy: 'A dark and stormy atmosphere — heavy, oppressive, relentless.',
    bright_sunny: 'Warm and luminous — a hopeful or triumphant chapter.',
    mysterious_fog: 'Shrouded in mystery; secrets and ancient truths linger in the air.',
    tense_battle: 'High tension and conflict dominate every line.',
    quiet_indoor: 'A contained, interior setting — the drama unfolds within four walls.',
    default: 'An undefined, open atmosphere.',
};

// ── Build weighted word→(mood,weight) map ONCE at module load ──
const ATMO_WORD_MAP = new Map<string, { mood: Atmosphere['mood']; weight: number }[]>();
for (const [mood, [t1, t2, t3]] of Object.entries(ATMO_TIERS) as [Atmosphere['mood'], [string[], string[], string[]]][]) {
    if (mood === 'default') continue;
    for (const w of t1) {
        const arr = ATMO_WORD_MAP.get(w) ?? [];
        arr.push({ mood, weight: 1 });
        ATMO_WORD_MAP.set(w, arr);
    }
    for (const w of t2) {
        const arr = ATMO_WORD_MAP.get(w) ?? [];
        arr.push({ mood, weight: 2 });
        ATMO_WORD_MAP.set(w, arr);
    }
    for (const w of t3) {
        const arr = ATMO_WORD_MAP.get(w) ?? [];
        arr.push({ mood, weight: 3 });
        ATMO_WORD_MAP.set(w, arr);
    }
}

export const processAtmosphere = async (text: string): Promise<Atmosphere> => {
    // Single tokenise pass + Map.has() — O(n) instead of O(words × keywords × regex)
    const tokens = tokenise(text);
    const scores: Partial<Record<Atmosphere['mood'], number>> = {};

    for (const token of tokens) {
        const entries = ATMO_WORD_MAP.get(token);
        if (!entries) continue;
        for (const { mood, weight } of entries) {
            scores[mood] = (scores[mood] ?? 0) + weight;
        }
    }

    let topMood: Atmosphere['mood'] = 'default';
    let topScore = 4;
    for (const [mood, score] of Object.entries(scores) as [Atmosphere['mood'], number][]) {
        if (score > topScore) { topScore = score; topMood = mood; }
    }

    return { mood: topMood, description: ATMO_DESCRIPTIONS[topMood] };
};

