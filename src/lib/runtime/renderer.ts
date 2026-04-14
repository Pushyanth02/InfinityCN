import type {
    CinematicBlock,
    EmotionCategory,
    RenderCue,
    RenderPlan,
    RenderScenePlan,
} from '../../types/cinematifier';

export interface RendererInputScene {
    title: string;
    paragraphs: string[];
}

const BASE_MS_PER_WORD = 280;
const MIN_CUE_DURATION_MS = 500;

function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function timingMultiplier(timing: CinematicBlock['timing']): number {
    switch (timing) {
        case 'slow':
            return 1.25;
        case 'quick':
            return 0.8;
        case 'rapid':
            return 0.65;
        default:
            return 1;
    }
}

function blockTypeMultiplier(type: CinematicBlock['type']): number {
    switch (type) {
        case 'dialogue':
            return 0.9;
        case 'beat':
            return 0.75;
        case 'sfx':
            return 0.6;
        case 'transition':
            return 0.7;
        case 'chapter_header':
        case 'title_card':
            return 0.85;
        default:
            return 1;
    }
}

function estimateCueDurationMs(block: CinematicBlock): number {
    const words = Math.max(1, countWords(block.content));
    const weighted = words * BASE_MS_PER_WORD;
    const timed = weighted * timingMultiplier(block.timing) * blockTypeMultiplier(block.type);

    return Math.max(MIN_CUE_DURATION_MS, Math.round(timed));
}

function mapCueSceneIndex(cueIndex: number, totalCues: number, sceneCount: number): number {
    if (sceneCount <= 1) return 0;
    if (totalCues <= 1) return 0;
    return Math.min(sceneCount - 1, Math.floor((cueIndex / totalCues) * sceneCount));
}

function pickDominantEmotion(cues: RenderCue[]): EmotionCategory | undefined {
    const counts = new Map<EmotionCategory, number>();

    for (const cue of cues) {
        if (!cue.emotion) continue;
        counts.set(cue.emotion, (counts.get(cue.emotion) ?? 0) + 1);
    }

    let dominant: EmotionCategory | undefined;
    let maxCount = 0;
    for (const [emotion, count] of counts) {
        if (count > maxCount) {
            dominant = emotion;
            maxCount = count;
        }
    }

    return dominant;
}

function averageTension(cues: RenderCue[]): number | undefined {
    const values = cues
        .map(cue => cue.tensionScore)
        .filter((score): score is number => typeof score === 'number');

    if (values.length === 0) return undefined;

    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round(sum / values.length);
}

function normalizeScenes(scenes?: RendererInputScene[]): RendererInputScene[] {
    if (!scenes || scenes.length === 0) {
        return [{ title: 'Scene 1', paragraphs: [] }];
    }

    return scenes;
}

export function buildRenderPlan(
    blocks: CinematicBlock[],
    scenes?: RendererInputScene[],
): RenderPlan {
    const sourceScenes = normalizeScenes(scenes);
    const sceneCount = sourceScenes.length;

    const cues: RenderCue[] = blocks.map((block, index) => ({
        blockId: block.id,
        blockType: block.type,
        sceneIndex: mapCueSceneIndex(index, blocks.length, sceneCount),
        content: block.content,
        estimatedDurationMs: estimateCueDurationMs(block),
        intensity: block.intensity,
        timing: block.timing,
        speaker: block.speaker,
        cameraDirection: block.cameraDirection,
        ambience: block.ambience,
        emotion: block.emotion,
        tensionScore: block.tensionScore,
    }));

    const scenesPlan: RenderScenePlan[] = sourceScenes.map((scene, sceneIndex) => {
        const sceneCues = cues.filter(cue => cue.sceneIndex === sceneIndex);
        const cueCount = sceneCues.length;
        const estimatedDurationMs = sceneCues.reduce(
            (sum, cue) => sum + cue.estimatedDurationMs,
            0,
        );

        return {
            id: `render-scene-${sceneIndex + 1}`,
            title: scene.title || `Scene ${sceneIndex + 1}`,
            sourceParagraphCount: scene.paragraphs.length,
            blockStartIndex: cueCount > 0 ? cues.findIndex(c => c.sceneIndex === sceneIndex) : -1,
            blockEndIndex:
                cueCount > 0
                    ? cues.length -
                      1 -
                      [...cues].reverse().findIndex(c => c.sceneIndex === sceneIndex)
                    : -1,
            cueCount,
            estimatedDurationMs,
            dominantEmotion: pickDominantEmotion(sceneCues),
            averageTensionScore: averageTension(sceneCues),
        };
    });

    const totalEstimatedDurationMs = scenesPlan.reduce(
        (sum, scene) => sum + scene.estimatedDurationMs,
        0,
    );

    return {
        cues,
        scenes: scenesPlan,
        totalEstimatedDurationMs,
        generatedAt: Date.now(),
    };
}
