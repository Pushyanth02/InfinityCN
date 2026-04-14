import React, { useEffect, useMemo, useState } from 'react';
import type { CinematicBlock } from '../../types/cinematifier';
import { CinematicBlockView } from './CinematicBlockView';

interface CinematicRendererProps {
    blocks: CinematicBlock[];
    immersionLevel: 'minimal' | 'balanced' | 'cinematic';
}

const INITIAL_RENDER_BLOCKS = 120;
const RENDER_BATCH_SIZE = 80;
const LOAD_AHEAD_MARGIN = '500px 0px';

function getParagraphType(
    block: CinematicBlock,
): 'scene' | 'dialogue' | 'reflection' | 'tension' | 'action' {
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

export const CinematicRenderer: React.FC<CinematicRendererProps> = React.memo(
    function CinematicRenderer({ blocks, immersionLevel }) {
        const [visibleCount, setVisibleCount] = useState(() =>
            Math.min(blocks.length, INITIAL_RENDER_BLOCKS),
        );
        const loadMoreRef = React.useRef<HTMLDivElement | null>(null);

        useEffect(() => {
            const timer = window.setTimeout(() => {
                setVisibleCount(prev => {
                    if (blocks.length <= INITIAL_RENDER_BLOCKS) return blocks.length;
                    return Math.min(blocks.length, Math.max(prev, INITIAL_RENDER_BLOCKS));
                });
            }, 0);

            return () => window.clearTimeout(timer);
        }, [blocks.length]);

        useEffect(() => {
            if (visibleCount >= blocks.length) return;

            const sentinel = loadMoreRef.current;
            if (!sentinel) return;

            if (typeof IntersectionObserver === 'undefined') {
                const timer = window.setTimeout(() => {
                    setVisibleCount(prev => Math.min(blocks.length, prev + RENDER_BATCH_SIZE));
                }, 32);
                return () => window.clearTimeout(timer);
            }

            const observer = new IntersectionObserver(
                entries => {
                    if (entries[0]?.isIntersecting) {
                        setVisibleCount(prev => Math.min(blocks.length, prev + RENDER_BATCH_SIZE));
                    }
                },
                {
                    root: null,
                    rootMargin: LOAD_AHEAD_MARGIN,
                    threshold: 0,
                },
            );

            observer.observe(sentinel);
            return () => observer.disconnect();
        }, [visibleCount, blocks.length]);

        const visibleBlocks = useMemo(() => blocks.slice(0, visibleCount), [blocks, visibleCount]);

        return (
            <>
                {visibleBlocks.map((block, i) => {
                    const paragraphType = getParagraphType(block);
                    return (
                        <div
                            key={block.id}
                            className={`cine-paragraph cine-paragraph--${paragraphType}`}
                            data-paragraph-type={paragraphType}
                            style={{ marginBlock: getBlockSpacing(block) }}
                        >
                            <CinematicBlockView
                                block={block}
                                index={i}
                                immersionLevel={immersionLevel}
                            />
                        </div>
                    );
                })}
                {visibleCount < blocks.length && (
                    <div ref={loadMoreRef} aria-hidden="true" style={{ height: 1 }} />
                )}
            </>
        );
    },
);
