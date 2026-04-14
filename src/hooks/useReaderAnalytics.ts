import { useEffect, useState } from 'react';
import type { Book, ReaderMode, ReadingProgress } from '../types/cinematifier';
import {
    getReaderAnalyticsSummary,
    recordReaderTelemetrySnapshot,
    type ReaderAnalyticsSummary,
} from '../lib/runtime/readerBackend';

const SNAPSHOT_INTERVAL_MS = 45_000;

interface UseReaderAnalyticsInput {
    book: Book | null;
    readingProgress: ReadingProgress | null;
    currentChapterIndex: number;
    readerMode: ReaderMode;
    contentRef: React.RefObject<HTMLDivElement | null>;
}

function computeScrollRatio(node: HTMLElement | null): number {
    if (!node) return 0;

    const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
    if (maxScroll <= 0) return 0;

    return Math.min(1, Math.max(0, node.scrollTop / maxScroll));
}

export function useReaderAnalytics({
    book,
    readingProgress,
    currentChapterIndex,
    readerMode,
    contentRef,
}: UseReaderAnalyticsInput): ReaderAnalyticsSummary | null {
    const [, setRefreshIndex] = useState(0);
    const summary = getReaderAnalyticsSummary(book, readingProgress);

    useEffect(() => {
        if (!book || !readingProgress) return;

        const contentNode = contentRef.current;

        const captureAndRefresh = () => {
            recordReaderTelemetrySnapshot({
                bookId: book.id,
                chapterNumber: currentChapterIndex + 1,
                readerMode,
                scrollRatio: computeScrollRatio(contentNode),
                totalReadTimeSec: readingProgress.totalReadTime,
                timestamp: Date.now(),
            });

            setRefreshIndex(current => current + 1);
        };

        const kickoffTimer = window.setTimeout(captureAndRefresh, 0);

        const timer = window.setInterval(() => {
            captureAndRefresh();
        }, SNAPSHOT_INTERVAL_MS);

        return () => {
            window.clearTimeout(kickoffTimer);
            window.clearInterval(timer);

            recordReaderTelemetrySnapshot({
                bookId: book.id,
                chapterNumber: currentChapterIndex + 1,
                readerMode,
                scrollRatio: computeScrollRatio(contentNode),
                totalReadTimeSec: readingProgress.totalReadTime,
                timestamp: Date.now(),
            });
        };
    }, [book, contentRef, currentChapterIndex, readerMode, readingProgress]);

    return summary;
}
