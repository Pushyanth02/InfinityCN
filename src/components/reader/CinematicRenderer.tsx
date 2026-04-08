import React from 'react';
import type { CinematicBlock } from '../../types/cinematifier';
import { CinematicBlockView } from './CinematicBlockView';

interface CinematicRendererProps {
    blocks: CinematicBlock[];
    immersionLevel: 'minimal' | 'balanced' | 'cinematic';
}

function getParagraphType(block: CinematicBlock): 'scene' | 'dialogue' | 'reflection' | 'tension' | 'action' {
    if (block.type === 'title_card') return 'scene';
    if (block.type === 'dialogue') return 'dialogue';
    if (block.type === 'inner_thought') return 'reflection';
    if ((block.tensionScore ?? 0) >= 70) return 'tension';
    return 'action';
}

function getBlockSpacing(block: CinematicBlock): string {
    if (block.type === 'title_card' || block.type === 'transition') return '2rem';
    if (block.type === 'dialogue') return '1.25rem';
    if (block.type === 'inner_thought') return '1.5rem';
    if ((block.tensionScore ?? 0) >= 80) return '1.75rem';
    return '1rem';
}

export const CinematicRenderer: React.FC<CinematicRendererProps> = ({ blocks, immersionLevel }) => {
    return (
        <>
            {blocks.map((block, i) => {
                const paragraphType = getParagraphType(block);
                return (
                    <div
                        key={block.id}
                        className={`cine-paragraph cine-paragraph--${paragraphType}`}
                        data-paragraph-type={paragraphType}
                        style={{ marginBlock: getBlockSpacing(block) }}
                    >
                        <CinematicBlockView block={block} index={i} immersionLevel={immersionLevel} />
                    </div>
                );
            })}
        </>
    );
};
