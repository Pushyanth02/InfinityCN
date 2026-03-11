/**
 * EmotionHeatmap.tsx — Chapter Tension Heatmap
 *
 * Displays chapter tension as a visual heatmap bar above the content,
 * showing average tension per segment with emotion-based coloring.
 */

import React, { useMemo } from 'react';
import type { CinematicBlock } from '../../types/cinematifier';

const HEATMAP_MIN_OPACITY = 0.15;
const HEATMAP_MAX_TENSION = 100;

export const EmotionHeatmap = React.memo(function EmotionHeatmap({
    blocks,
}: {
    blocks: CinematicBlock[];
}) {
    // Group blocks into segments and compute average tension per segment
    const segments = useMemo(() => {
        if (blocks.length === 0) return [];

        const SEGMENT_SIZE = Math.max(1, Math.ceil(blocks.length / 30));
        const result: { tension: number; emotion: string }[] = [];

        for (let i = 0; i < blocks.length; i += SEGMENT_SIZE) {
            const slice = blocks.slice(i, i + SEGMENT_SIZE);
            const tensions = slice
                .map(b => b.tensionScore)
                .filter((t): t is number => t !== undefined);
            const avgTension =
                tensions.length > 0 ? tensions.reduce((a, b) => a + b, 0) / tensions.length : 30;

            // Pick dominant emotion using pre-computed frequency map
            const emotions = slice
                .map(b => b.emotion)
                .filter((e): e is NonNullable<typeof e> => e !== undefined);
            let dominantEmotion = 'neutral';
            if (emotions.length > 0) {
                const counts = new Map<string, number>();
                for (const e of emotions) {
                    counts.set(e, (counts.get(e) || 0) + 1);
                }
                let maxCount = 0;
                for (const [emotion, count] of counts) {
                    if (count > maxCount) {
                        maxCount = count;
                        dominantEmotion = emotion;
                    }
                }
            }

            result.push({ tension: avgTension, emotion: dominantEmotion });
        }

        return result;
    }, [blocks]);

    if (segments.length === 0) return null;

    return (
        <div className="cine-emotion-heatmap" aria-label="Chapter tension heatmap">
            {segments.map((seg, i) => (
                <div
                    key={`hm-${i}-${seg.emotion}`}
                    className={`cine-heatmap-block cine-heatmap-block--${seg.emotion}`}
                    style={{
                        opacity: Math.max(HEATMAP_MIN_OPACITY, seg.tension / HEATMAP_MAX_TENSION),
                    }}
                    title={`Tension: ${Math.round(seg.tension)}`}
                />
            ))}
        </div>
    );
});
