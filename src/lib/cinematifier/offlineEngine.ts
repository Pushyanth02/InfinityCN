/**
 * offlineEngine.ts — Offline/Fallback Cinematification Engine
 *
 * Provides heuristic-based cinematification when AI processing is unavailable.
 * Uses pattern matching for dialogue detection, SFX triggers, scene transitions,
 * dramatic beats, and chapter headers.
 */

import type { CinematicBlock, CinematificationResult } from '../../types/cinematifier';
import { generateBlockId } from './parser';
import { detectSceneBreaks, deriveSceneTitle } from './sceneDetection';

// ─── Fallback Block Creation ───────────────────────────────

function createFallbackBlocks(text: string): CinematicBlock[] {
    const blocks: CinematicBlock[] = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    // Use heuristic scene detection to group paragraphs into scenes
    const scenes = detectSceneBreaks(paragraphs);

    // Scene transition patterns
    const transitionPatterns = [
        /^(later|meanwhile|the next|hours later|days later|suddenly|elsewhere)/i,
        /^\*{3,}/,
        /^---+/,
    ];

    // SFX trigger words — combined into a single regex for O(1) per paragraph
    const sfxCombined =
        /\b(explod|blast|detona|thunder|lightning|crash|shatter|smash|gunshot|shot|fires?\b|knock|door|creak|whisper|murmur|hush|scream|shout|yell|footstep|stride|stomp|rain|storm|wind|heart|pulse|beat)\b/i;
    const sfxLookup: Record<string, [string, 'soft' | 'medium' | 'loud' | 'explosive']> = {
        explod: ['EXPLOSION', 'explosive'],
        blast: ['EXPLOSION', 'explosive'],
        detona: ['EXPLOSION', 'explosive'],
        thunder: ['THUNDER', 'loud'],
        lightning: ['THUNDER', 'loud'],
        crash: ['CRASH', 'loud'],
        shatter: ['CRASH', 'loud'],
        smash: ['CRASH', 'loud'],
        gunshot: ['GUNSHOT', 'loud'],
        shot: ['GUNSHOT', 'loud'],
        fire: ['GUNSHOT', 'loud'],
        knock: ['DOOR', 'medium'],
        door: ['DOOR', 'medium'],
        creak: ['DOOR', 'medium'],
        whisper: ['WHISPER', 'soft'],
        murmur: ['WHISPER', 'soft'],
        hush: ['WHISPER', 'soft'],
        scream: ['SCREAM', 'loud'],
        shout: ['SCREAM', 'loud'],
        yell: ['SCREAM', 'loud'],
        footstep: ['FOOTSTEPS', 'medium'],
        stride: ['FOOTSTEPS', 'medium'],
        stomp: ['FOOTSTEPS', 'medium'],
        rain: ['WIND HOWLING', 'medium'],
        storm: ['WIND HOWLING', 'medium'],
        wind: ['WIND HOWLING', 'medium'],
        heart: ['HEARTBEAT', 'soft'],
        pulse: ['HEARTBEAT', 'soft'],
        beat: ['HEARTBEAT', 'soft'],
    };

    // Dialogue pattern
    const dialoguePattern = /"([^"]+)"/g;
    const speakerBeforePattern =
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|whispered|shouted|muttered|replied|asked|exclaimed)/;
    const speakerAfterPattern =
        /(?:said|whispered|shouted|muttered|replied|asked|exclaimed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

    for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) continue;

        // Insert scene title cards at the start of each detected scene (if multiple scenes)
        if (scenes.length > 1) {
            for (let s = 0; s < scenes.length; s++) {
                if (scenes[s][0] === para && (s > 0 || i === 0)) {
                    if (s > 0) {
                        // Add scene break before new scene
                        blocks.push({
                            id: generateBlockId(),
                            type: 'beat',
                            content: '— ✦ —',
                            intensity: 'normal',
                            beat: { type: 'PAUSE' },
                        });
                    }
                    // Derive a scene title from context
                    const sceneTitle = deriveSceneTitle(scenes[s], s + 1);
                    blocks.push({
                        id: generateBlockId(),
                        type: 'title_card',
                        content: sceneTitle,
                        intensity: 'normal',
                    });
                    break;
                }
            }
        }

        // Check for scene transition
        if (transitionPatterns.some(p => p.test(para))) {
            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: para,
                intensity: 'normal',
                transition: { type: 'CUT TO' },
            });

            // Add a beat after transitions
            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
            continue;
        }

        // Check for chapter headers
        if (/^(chapter|part|book|prologue|epilogue)\s*[\d\w]+/i.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'title_card',
                content: para.toUpperCase(),
                intensity: 'emphasis',
            });

            blocks.push({
                id: generateBlockId(),
                type: 'transition',
                content: '',
                intensity: 'normal',
                transition: { type: 'FADE IN' },
            });
            continue;
        }

        // Check for dialogue
        const dialogueMatches = [...para.matchAll(dialoguePattern)];
        if (dialogueMatches.length > 0) {
            // Find speaker
            let speaker: string | undefined;
            const beforeMatch = para.match(speakerBeforePattern);
            const afterMatch = para.match(speakerAfterPattern);
            if (beforeMatch) speaker = beforeMatch[1].toUpperCase();
            else if (afterMatch) speaker = afterMatch[1].toUpperCase();

            for (const match of dialogueMatches) {
                const dialogue = match[1];

                // Determine intensity from punctuation and context
                let intensity: CinematicBlock['intensity'] = 'normal';
                if (dialogue.includes('!') || /shout|scream|yell/i.test(para)) {
                    intensity = 'shout';
                } else if (/whisper|murmur|softly/i.test(para)) {
                    intensity = 'whisper';
                }

                blocks.push({
                    id: generateBlockId(),
                    type: 'dialogue',
                    content: dialogue,
                    speaker,
                    intensity,
                });
            }

            // Add narration for non-dialogue parts
            const narration = para.replace(dialoguePattern, '').trim();
            if (narration.length > 20) {
                blocks.push({
                    id: generateBlockId(),
                    type: 'action',
                    content: narration,
                    intensity: 'normal',
                });
            }
        } else {
            // Regular narration/action
            let intensity: CinematicBlock['intensity'] = 'normal';
            if (para.includes('!')) intensity = 'emphasis';
            if (para.includes('...') || para.includes('\u2026')) intensity = 'whisper';

            blocks.push({
                id: generateBlockId(),
                type: 'action',
                content: para,
                intensity,
            });
        }

        // Check for SFX triggers in the paragraph (single regex, O(1))
        const sfxMatch = para.match(sfxCombined);
        if (sfxMatch) {
            const key = sfxMatch[1].toLowerCase().replace(/[sd]$/, '');
            const entry = sfxLookup[key] ?? sfxLookup[sfxMatch[1].toLowerCase()];
            if (entry) {
                const [sound, sfxIntensity] = entry;
                blocks.push({
                    id: generateBlockId(),
                    type: 'sfx',
                    content: 'SFX: ' + sound,
                    intensity: sfxIntensity === 'explosive' ? 'explosive' : 'emphasis',
                    sfx: { sound, intensity: sfxIntensity },
                });
            }
        }

        // Add dramatic beats for emotional moments
        if (/\.\.\.|…|—$|sudden|shock|realiz|gasp/i.test(para)) {
            blocks.push({
                id: generateBlockId(),
                type: 'beat',
                content: '',
                intensity: 'normal',
                beat: { type: 'BEAT' },
            });
        }
    }

    return blocks;
}

// ─── Public API ──────────────────────────────────────────────

export function cinematifyOffline(text: string): CinematificationResult {
    const startTime = performance.now();
    const blocks = createFallbackBlocks(text);

    let sfxCount = 0;
    let transitionCount = 0;
    let beatCount = 0;

    for (const block of blocks) {
        if (block.sfx) sfxCount++;
        if (block.transition) transitionCount++;
        if (block.beat) beatCount++;
    }

    return {
        blocks,
        rawText: blocks.map(b => b.content).join('\n\n'),
        metadata: {
            originalWordCount: text.split(/\s+/).length,
            cinematifiedWordCount: blocks.reduce(
                (acc, b) => acc + (b.content?.split(/\s+/).length || 0),
                0,
            ),
            sfxCount,
            transitionCount,
            beatCount,
            processingTimeMs: Math.round(performance.now() - startTime),
        },
    };
}
