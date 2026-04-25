/**
 * OriginalTextView.tsx — Enhanced Plain Text Renderer
 *
 * Displays the original novel text with:
 *   - Scene-aware spacing (uses originalModeScenes if available)
 *   - Pull quote styling for long dialogue paragraphs
 *   - Drop-cap on first paragraph
 *   - Virtualized rendering for long chapters
 *   - Progressive loading fallback for non-virtualized mode
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { VirtualizedContent } from './VirtualizedContent';
import type { VirtualItem } from './VirtualizedContent';
import type { OriginalModeScene } from '../../types/cinematifier';

const MAX_ANIMATED_PARAGRAPHS = 180;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface OriginalTextViewProps {
    text: string;
    /** Original mode scene segmentation for scene-aware spacing */
    scenes?: OriginalModeScene[];
    /** Scroll container ref for virtualization */
    containerRef?: React.RefObject<HTMLElement | null>;
}

// ─── Paragraph Classification ──────────────────────────────────────────────────

const DIALOGUE_START = /^["\u201C]|^[A-Z][A-Z\s]{1,30}:/;
const PULL_QUOTE_MIN_LENGTH = 200;

interface ClassifiedParagraph {
    text: string;
    isDialogue: boolean;
    isPullQuote: boolean;
    isSceneStart: boolean;
}

function classifyParagraphs(
    text: string,
    scenes?: OriginalModeScene[],
): ClassifiedParagraph[] {
    const rawParagraphs = text.split(/\n\s*\n/).filter(p => p.trim());

    // Build a set of paragraph indices that start scenes
    const sceneStartIndices = new Set<number>();
    if (scenes && scenes.length > 1) {
        let searchFrom = 0;
        for (const scene of scenes) {
            const sceneText = scene.text.trim().slice(0, 80);
            if (!sceneText) continue;

            for (let i = searchFrom; i < rawParagraphs.length; i++) {
                if (rawParagraphs[i].trim().startsWith(sceneText)) {
                    sceneStartIndices.add(i);
                    searchFrom = i + 1;
                    break;
                }
            }
        }
    }

    return rawParagraphs.map((p, i) => {
        const trimmed = p.trim();
        const isDialogue = DIALOGUE_START.test(trimmed);
        const isPullQuote = isDialogue && trimmed.length >= PULL_QUOTE_MIN_LENGTH;
        const isSceneStart = sceneStartIndices.has(i) && i > 0;

        return { text: trimmed, isDialogue, isPullQuote, isSceneStart };
    });
}

// ─── Scene Separator ───────────────────────────────────────────────────────────

const SceneSeparator = React.memo(function SceneSeparator() {
    return (
        <div className="original-scene-separator" aria-hidden>
            <span className="original-scene-separator__ornament">✦ ✦ ✦</span>
        </div>
    );
});

// ─── Paragraph Renderer ───────────────────────────────────────────────────────

const ParagraphItem = React.memo(function ParagraphItem({
    para,
    index,
    isFirst,
}: {
    para: ClassifiedParagraph;
    index: number;
    isFirst: boolean;
}) {
    const className = [
        'original-paragraph',
        para.isDialogue ? 'original-paragraph--dialogue' : '',
        para.isPullQuote ? 'original-paragraph--pull-quote' : '',
        isFirst ? 'original-paragraph--first' : '',
    ].filter(Boolean).join(' ');

    // Skip animation for paragraphs beyond threshold
    if (index >= MAX_ANIMATED_PARAGRAPHS) {
        return <p className={className}>{para.text}</p>;
    }

    return (
        <motion.p
            className={className}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-5% 0px' }}
            transition={{ duration: 0.5, delay: Math.min(index * 0.02, 0.3) }}
        >
            {para.text}
        </motion.p>
    );
});

// ─── Component ─────────────────────────────────────────────────────────────────

export const OriginalTextView = React.memo(function OriginalTextView({
    text,
    scenes,
    containerRef,
}: OriginalTextViewProps) {
    const paragraphs = useMemo(() => classifyParagraphs(text, scenes), [text, scenes]);

    // Build virtual items for virtualized rendering
    const virtualItems: VirtualItem[] = useMemo(() => {
        const items: VirtualItem[] = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];

            // Insert scene separator before scene starts
            if (para.isSceneStart) {
                items.push({
                    key: `scene-sep-${i}`,
                    content: <SceneSeparator />,
                    estimatedHeight: 56,
                });
            }

            items.push({
                key: `p-${i}-${para.text.slice(0, 24)}`,
                content: (
                    <ParagraphItem
                        para={para}
                        index={i}
                        isFirst={i === 0}
                    />
                ),
                estimatedHeight: 24 + Math.ceil(para.text.length / 70) * 26,
            });
        }

        return items;
    }, [paragraphs]);

    // Virtualized path
    if (containerRef) {
        return (
            <VirtualizedContent
                items={virtualItems}
                containerRef={containerRef}
                className="original-text-view"
                overscan={25}
                threshold={100}
            />
        );
    }

    // Non-virtualized path
    return (
        <div className="original-text-view">
            {paragraphs.map((para, i) => (
                <React.Fragment key={`p-${i}-${para.text.slice(0, 24)}`}>
                    {para.isSceneStart && <SceneSeparator />}
                    <ParagraphItem para={para} index={i} isFirst={i === 0} />
                </React.Fragment>
            ))}
        </div>
    );
});
