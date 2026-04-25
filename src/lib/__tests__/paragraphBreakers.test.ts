import { describe, expect, it } from 'vitest';
import {
    chooseParagraphBreakerResult,
    rebuildParagraphsWithBreakerApis,
    runParagraphBreakerApis,
} from '../engine/cinematifier/paragraphBreakers';

function canonical(text: string): string {
    return text.replace(/\s+/g, '');
}

describe('paragraphBreakers', () => {
    it('returns multiple strategy results with confidence scores', () => {
        const text =
            'The corridor hummed with old lights. Mara checked the lock and stepped inside. Suddenly the alarm rang. Nobody moved.';

        const results = runParagraphBreakerApis(text);

        expect(results.length).toBeGreaterThanOrEqual(3);
        expect(results.every(result => result.confidence >= 0)).toBe(true);
        expect(results.some(result => result.strategy === 'scene-cue')).toBe(true);
    });

    it('selects the best canonical strategy result', () => {
        const text =
            'The rain started without warning. "Run," Mara said. Eli froze. "Now," she shouted. The lights cut out.';

        const results = runParagraphBreakerApis(text);
        const best = chooseParagraphBreakerResult(text, results);

        expect(best).not.toBeNull();
        expect(canonical(best?.paragraphs.join(' ') ?? '')).toBe(canonical(text));
    });

    it('rebuilds long dense lines into readable paragraphs without changing content', () => {
        const text =
            'They crossed the courtyard while the storm grew louder and the windows rattled in every room. The iron gate groaned. Later, the bell struck midnight and everyone looked at the tower in silence.';

        const paragraphs = rebuildParagraphsWithBreakerApis(text, {
            maxSentencesPerParagraph: 2,
            maxWordsPerParagraph: 26,
        });

        expect(paragraphs.length).toBeGreaterThan(1);
        expect(canonical(paragraphs.join(' '))).toBe(canonical(text));
    });
});
