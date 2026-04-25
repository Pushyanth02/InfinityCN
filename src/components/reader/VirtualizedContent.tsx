/**
 * VirtualizedContent.tsx — Windowed Content Renderer
 *
 * Only mounts items visible in the scroll viewport plus a buffer zone.
 * Uses the "virtual scroll with variable heights" pattern:
 *
 *   1. Measures each item after first render, caches heights
 *   2. Renders spacer divs above/below the visible window
 *   3. Buffer zone: ±overscan items beyond viewport edges
 *   4. Falls back to full render for small lists (< threshold)
 *
 * Works for both OriginalTextView paragraphs and CinematicBlockView blocks.
 *
 * Constraints:
 *   - No heavy DOM measurement in the render path
 *   - Preserves data- attributes for IntersectionObserver consumers
 *   - Mobile-first: reduced overscan on narrow viewports
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VirtualItem {
    /** Stable key for React reconciliation */
    key: string;
    /** The rendered content */
    content: React.ReactNode;
    /** Estimated height in px (used before measurement) */
    estimatedHeight: number;
}

interface VirtualizedContentProps {
    /** Items to virtualize */
    items: VirtualItem[];
    /** Scroll container ref (must be the element with overflow-y: auto) */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Number of off-screen items to render above/below viewport */
    overscan?: number;
    /** Disable virtualization (render all items) */
    disabled?: boolean;
    /** Minimum item count before virtualization kicks in */
    threshold?: number;
    /** Optional className for the wrapper */
    className?: string;
}

// ─── Height Cache ──────────────────────────────────────────────────────────────

function useHeightCache(itemCount: number) {
    const cache = useRef<Map<number, number>>(new Map());

    // Clear stale entries when item count shrinks
    useEffect(() => {
        const current = cache.current;
        for (const key of current.keys()) {
            if (key >= itemCount) current.delete(key);
        }
    }, [itemCount]);

    const setHeight = useCallback((index: number, height: number) => {
        cache.current.set(index, height);
    }, []);

    const getHeight = useCallback(
        (index: number, fallback: number): number => {
            return cache.current.get(index) ?? fallback;
        },
        [],
    );

    return { setHeight, getHeight };
}

// ─── Visible Range Computation ─────────────────────────────────────────────────

function computeVisibleRange(
    scrollTop: number,
    viewportHeight: number,
    items: VirtualItem[],
    getHeight: (index: number, fallback: number) => number,
    overscan: number,
): { start: number; end: number; offsetTop: number; totalHeight: number } {
    const count = items.length;

    // Compute cumulative offsets
    let offset = 0;
    let startIndex = -1;
    let endIndex = count - 1;

    for (let i = 0; i < count; i++) {
        const h = getHeight(i, items[i].estimatedHeight);
        if (startIndex === -1 && offset + h > scrollTop) {
            startIndex = i;
        }
        if (startIndex !== -1 && offset > scrollTop + viewportHeight) {
            endIndex = i;
            break;
        }
        offset += h;
    }

    if (startIndex === -1) startIndex = 0;

    // Apply overscan
    const start = Math.max(0, startIndex - overscan);
    const end = Math.min(count - 1, endIndex + overscan);

    // Compute offset for the start spacer
    let offsetTop = 0;
    for (let i = 0; i < start; i++) {
        offsetTop += getHeight(i, items[i].estimatedHeight);
    }

    // Total height for scroll sizing
    let totalHeight = 0;
    for (let i = 0; i < count; i++) {
        totalHeight += getHeight(i, items[i].estimatedHeight);
    }

    return { start, end, offsetTop, totalHeight };
}

// ─── Item Wrapper (measures height) ────────────────────────────────────────────

const VirtualItemWrapper = React.memo(function VirtualItemWrapper({
    index,
    onMeasure,
    children,
}: {
    index: number;
    onMeasure: (index: number, height: number) => void;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Initial measurement
        onMeasure(index, el.offsetHeight);

        // Re-measure on resize (fonts, viewport changes)
        if (typeof ResizeObserver === 'undefined') return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const height =
                    entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
                if (height > 0) onMeasure(index, height);
            }
        });

        observer.observe(el);
        return () => observer.disconnect();
    }, [index, onMeasure]);

    return <div ref={ref}>{children}</div>;
});

// ─── Component ─────────────────────────────────────────────────────────────────

export const VirtualizedContent: React.FC<VirtualizedContentProps> = React.memo(
    function VirtualizedContent({
        items,
        containerRef,
        overscan = 20,
        disabled = false,
        threshold = 80,
        className,
    }) {
        const [scrollTop, setScrollTop] = useState(0);
        const [viewportHeight, setViewportHeight] = useState(800);
        const { setHeight, getHeight } = useHeightCache(items.length);

        // Should we virtualize?
        const shouldVirtualize = !disabled && items.length >= threshold;

        // Track scroll position
        useEffect(() => {
            const container = containerRef.current;
            if (!container || !shouldVirtualize) return;

            const onScroll = () => {
                setScrollTop(container.scrollTop);
            };

            const onResize = () => {
                setViewportHeight(container.clientHeight);
            };

            // Initial values
            setScrollTop(container.scrollTop);
            setViewportHeight(container.clientHeight);

            container.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onResize, { passive: true });

            return () => {
                container.removeEventListener('scroll', onScroll);
                window.removeEventListener('resize', onResize);
            };
        }, [containerRef, shouldVirtualize]);

        // Compute visible range
        const { start, end, offsetTop, totalHeight } = useMemo(() => {
            if (!shouldVirtualize) {
                return { start: 0, end: items.length - 1, offsetTop: 0, totalHeight: 0 };
            }
            return computeVisibleRange(scrollTop, viewportHeight, items, getHeight, overscan);
        }, [scrollTop, viewportHeight, items, getHeight, overscan, shouldVirtualize]);

        // Slice visible items
        const visibleItems = useMemo(
            () => (shouldVirtualize ? items.slice(start, end + 1) : items),
            [items, start, end, shouldVirtualize],
        );

        // Bottom spacer height
        const bottomSpacerHeight = useMemo(() => {
            if (!shouldVirtualize) return 0;
            let height = 0;
            for (let i = end + 1; i < items.length; i++) {
                height += getHeight(i, items[i].estimatedHeight);
            }
            return height;
        }, [shouldVirtualize, end, items, getHeight]);

        // Non-virtualized render
        if (!shouldVirtualize) {
            return (
                <div className={className}>
                    {items.map((item, i) => (
                        <VirtualItemWrapper key={item.key} index={i} onMeasure={setHeight}>
                            {item.content}
                        </VirtualItemWrapper>
                    ))}
                </div>
            );
        }

        // Virtualized render
        return (
            <div className={className} style={{ position: 'relative' }}>
                {/* Total height placeholder for scroll sizing */}
                <div
                    aria-hidden
                    style={{
                        height: totalHeight,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: 0,
                        pointerEvents: 'none',
                        visibility: 'hidden',
                    }}
                />

                {/* Top spacer */}
                {offsetTop > 0 && (
                    <div aria-hidden style={{ height: offsetTop, flexShrink: 0 }} />
                )}

                {/* Visible items */}
                {visibleItems.map((item, i) => {
                    const actualIndex = start + i;
                    return (
                        <VirtualItemWrapper
                            key={item.key}
                            index={actualIndex}
                            onMeasure={setHeight}
                        >
                            {item.content}
                        </VirtualItemWrapper>
                    );
                })}

                {/* Bottom spacer */}
                {bottomSpacerHeight > 0 && (
                    <div aria-hidden style={{ height: bottomSpacerHeight, flexShrink: 0 }} />
                )}
            </div>
        );
    },
);
