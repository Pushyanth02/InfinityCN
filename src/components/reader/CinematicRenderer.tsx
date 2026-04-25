/**
 * CinematicRenderer.tsx — Pacing-Aware Block Renderer
 *
 * Renders CinematicBlocks with:
 *   - Dynamic pacing-based spacing (via usePacingEngine)
 *   - Virtualized rendering for long chapters (via VirtualizedContent)
 *   - Scene dividers at detected scene boundaries
 *   - Progressive loading for non-virtualized chapters
 *
 * The renderer wraps each block in a pacing-styled container that applies
 * spacing, opacity, and letter-spacing computed from the block's timing,
 * tension, and intensity metadata.
 */

import React, { useMemo } from 'react';
import type { CinematicBlock, ImmersionLevel } from '../../types/cinematifier';
import { CinematicBlockView } from './CinematicBlockView';
import { VirtualizedContent } from './VirtualizedContent';
import type { VirtualItem } from './VirtualizedContent';
import { usePacingEngine } from '../../hooks/usePacingEngine';

interface CinematicRendererProps {
    blocks: CinematicBlock[];
    immersionLevel: ImmersionLevel;
    /** Scroll container ref for virtualization */
    containerRef?: React.RefObject<HTMLElement | null>;
}

// ─── Height Estimation ─────────────────────────────────────────────────────────

function estimateBlockHeight(block: CinematicBlock): number {
    const contentLen = block.content.length;
    const baseHeight = 24; // min height per block

    switch (block.type) {
        case 'beat':
        case 'sfx':
            return baseHeight + 20;
        case 'transition':
        case 'title_card':
        case 'chapter_header':
            return baseHeight + 40;
        case 'dialogue':
            return baseHeight + Math.ceil(contentLen / 60) * 22 + (block.speaker ? 20 : 0);
        default:
            return baseHeight + Math.ceil(contentLen / 70) * 22;
    }
}

// ─── Scene Divider ─────────────────────────────────────────────────────────────

const SceneDivider = React.memo(function SceneDivider() {
    return (
        <div className="cine-scene-divider" aria-hidden>
            <div className="cine-scene-divider__line" />
            <div className="cine-scene-divider__dot" />
            <div className="cine-scene-divider__line" />
        </div>
    );
});

// ─── Component ─────────────────────────────────────────────────────────────────

export const CinematicRenderer: React.FC<CinematicRendererProps> = React.memo(
    function CinematicRenderer({ blocks, immersionLevel, containerRef }) {
        const pacingStyles = usePacingEngine(blocks, immersionLevel);

        // Build virtual items with pacing styles baked in
        const virtualItems: VirtualItem[] = useMemo(() => {
            const items: VirtualItem[] = [];

            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                const pacing = pacingStyles[i];

                // Insert scene divider before scene breaks
                if (pacing.isSceneBreak) {
                    items.push({
                        key: `divider-${block.id}`,
                        content: <SceneDivider />,
                        estimatedHeight: 48,
                    });
                }

                const blockStyle: React.CSSProperties = {
                    marginBlock: pacing.marginBlock,
                    letterSpacing: pacing.letterSpacing,
                    opacity: pacing.opacity,
                };

                const wrapperClasses = [
                    'cine-paragraph',
                    `cine-paragraph--${getParagraphType(block)}`,
                    pacing.pacingClass,
                ].filter(Boolean).join(' ');

                items.push({
                    key: block.id,
                    content: (
                        <div
                            className={wrapperClasses}
                            data-paragraph-type={getParagraphType(block)}
                            style={blockStyle}
                        >
                            <CinematicBlockView
                                block={block}
                                index={i}
                                immersionLevel={immersionLevel}
                            />
                        </div>
                    ),
                    estimatedHeight: estimateBlockHeight(block),
                });
            }

            return items;
        }, [blocks, pacingStyles, immersionLevel]);

        // Use virtualized rendering if container ref is provided
        if (containerRef) {
            return (
                <VirtualizedContent
                    items={virtualItems}
                    containerRef={containerRef}
                    className="cine-blocks"
                    overscan={20}
                    threshold={80}
                />
            );
        }

        // Fallback: render all items directly (no virtualization)
        return (
            <div className="cine-blocks">
                {virtualItems.map(item => (
                    <React.Fragment key={item.key}>{item.content}</React.Fragment>
                ))}
            </div>
        );
    },
);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getParagraphType(
    block: CinematicBlock,
): 'scene' | 'dialogue' | 'reflection' | 'tension' | 'action' {
    if (block.type === 'title_card') return 'scene';
    if (block.type === 'dialogue') return 'dialogue';
    if (block.type === 'inner_thought') return 'reflection';
    if ((block.tensionScore ?? 0) >= 70) return 'tension';
    return 'action';
}
