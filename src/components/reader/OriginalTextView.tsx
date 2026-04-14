/**
 * OriginalTextView.tsx — Plain Text Renderer
 *
 * Displays the original novel text with paragraph animations.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const INITIAL_RENDER_PARAGRAPHS = 140;
const RENDER_BATCH_SIZE = 100;
const LOAD_AHEAD_MARGIN = '400px 0px';
const MAX_ANIMATED_PARAGRAPHS = 180;

export const OriginalTextView = React.memo(function OriginalTextView({ text }: { text: string }) {
    const paragraphs = useMemo(() => text.split(/\n\s*\n/).filter(p => p.trim()), [text]);
    const dialogueStart = /^[“"]|^[A-Z][A-Z\s]{1,30}:/;
    const [visibleCount, setVisibleCount] = React.useState(() =>
        Math.min(paragraphs.length, INITIAL_RENDER_PARAGRAPHS),
    );
    const loadMoreRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        setVisibleCount(Math.min(paragraphs.length, INITIAL_RENDER_PARAGRAPHS));
    }, [paragraphs.length]);

    React.useEffect(() => {
        if (visibleCount >= paragraphs.length) return;

        const sentinel = loadMoreRef.current;
        if (!sentinel) return;

        if (typeof IntersectionObserver === 'undefined') {
            const timer = window.setTimeout(() => {
                setVisibleCount(prev => Math.min(paragraphs.length, prev + RENDER_BATCH_SIZE));
            }, 32);
            return () => window.clearTimeout(timer);
        }

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0]?.isIntersecting) {
                    setVisibleCount(prev => Math.min(paragraphs.length, prev + RENDER_BATCH_SIZE));
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
    }, [visibleCount, paragraphs.length]);

    const visibleParagraphs = useMemo(
        () => paragraphs.slice(0, visibleCount),
        [paragraphs, visibleCount],
    );

    return (
        <div className="original-text-view">
            {visibleParagraphs.map((para, i) => {
                const className =
                    `original-paragraph ${dialogueStart.test(para.trim()) ? 'original-paragraph--dialogue' : ''}`.trim();
                const key = `p-${i}-${para.slice(0, 32)}`;

                if (i >= MAX_ANIMATED_PARAGRAPHS) {
                    return (
                        <p key={key} className={className}>
                            {para}
                        </p>
                    );
                }

                return (
                    <motion.p
                        key={key}
                        className={className}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-5% 0px' }}
                        transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.3) }}
                    >
                        {para}
                    </motion.p>
                );
            })}
            {visibleCount < paragraphs.length && (
                <div ref={loadMoreRef} aria-hidden="true" style={{ height: 1 }} />
            )}
        </div>
    );
});
