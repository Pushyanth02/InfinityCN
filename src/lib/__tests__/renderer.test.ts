import { describe, expect, it } from 'vitest';
import { buildRenderPlan } from '../runtime/renderer';
import type { CinematicBlock } from '../../types/cinematifier';

describe('runtime renderer plan', () => {
    it('builds render cues and scene plans from cinematic blocks', () => {
        const blocks: CinematicBlock[] = [
            {
                id: 'b1',
                type: 'action',
                content: 'The hallway lights flickered as the storm rolled in.',
                intensity: 'normal',
                cameraDirection: 'WIDE ESTABLISHING',
                ambience: 'storm rumble',
                emotion: 'suspense',
                tensionScore: 46,
            },
            {
                id: 'b2',
                type: 'dialogue',
                content: '"Stay close," Aria said.',
                speaker: 'Aria',
                intensity: 'emphasis',
                emotion: 'fear',
                tensionScore: 62,
                timing: 'quick',
            },
        ];

        const plan = buildRenderPlan(blocks, [
            { title: 'Storm Corridor', paragraphs: ['The hallway lights flickered.'] },
            { title: 'Whispered Warning', paragraphs: ['"Stay close," Aria said.'] },
        ]);

        expect(plan.cues).toHaveLength(2);
        expect(plan.scenes).toHaveLength(2);
        expect(plan.totalEstimatedDurationMs).toBeGreaterThan(0);
        expect(plan.scenes[0].title).toBe('Storm Corridor');
        expect(plan.scenes[1].title).toBe('Whispered Warning');
        expect(plan.cues[0].cameraDirection).toBe('WIDE ESTABLISHING');
        expect(plan.cues[0].ambience).toBe('storm rumble');
    });

    it('returns an empty cue plan when no blocks are present', () => {
        const plan = buildRenderPlan([]);

        expect(plan.cues).toEqual([]);
        expect(plan.scenes).toHaveLength(1);
        expect(plan.scenes[0].cueCount).toBe(0);
        expect(plan.totalEstimatedDurationMs).toBe(0);
    });
});
