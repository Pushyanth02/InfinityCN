/**
 * useAutoScroll — Tension-based auto-scroll pacing hook
 *
 * Scrolls the content area automatically at a speed inversely proportional
 * to the current tension level, creating a dramatic pacing effect.
 * Extracted from CinematicReader.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ReaderMode } from '../types/cinematifier';

export function useAutoScroll(
    contentRef: React.RefObject<HTMLDivElement | null>,
    activeTension: number,
    readerMode: ReaderMode,
) {
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const autoScrollRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isAutoScrolling || !contentRef.current || readerMode !== 'cinematified') {
            if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
            return;
        }

        let lastTime = performance.now();
        const scrollStep = (time: number) => {
            const dt = time - lastTime;
            lastTime = time;

            if (contentRef.current) {
                const speedMultiplier = 1 - ((activeTension || 0) / 100) * 0.7;
                const pixelsToScroll = (40 * speedMultiplier * dt) / 1000;

                contentRef.current.scrollTop += pixelsToScroll;

                if (
                    contentRef.current.scrollTop + contentRef.current.clientHeight >=
                    contentRef.current.scrollHeight - 2
                ) {
                    setIsAutoScrolling(false);
                    return;
                }
            }

            autoScrollRef.current = requestAnimationFrame(scrollStep);
        };

        autoScrollRef.current = requestAnimationFrame(scrollStep);

        return () => {
            if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
        };
    }, [isAutoScrolling, activeTension, readerMode, contentRef]);

    const toggleAutoScroll = useCallback(() => {
        setIsAutoScrolling(prev => !prev);
    }, []);

    return {
        isAutoScrolling,
        toggleAutoScroll,
    };
}
