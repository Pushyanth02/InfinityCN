/**
 * chapterSegmentation.ts — Chapter Boundary Detection
 *
 * Splits raw book text into chapter segments by detecting heading patterns
 * (Chapter N, Part I, Prologue, etc.) and divider markers (***, ---).
 */

import type { ChapterSegment } from '../../types/cinematifier';

const CHAPTER_PATTERNS = [
    /^(chapter\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(part\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(book\s+)(\d+|[ivxlcdm]+|\w+)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^(prologue|epilogue)(?:\s*[:.\-–—]\s*(.*))?$/im,
    /^\*{3,}\s*$/m, // *** dividers
    /^-{3,}\s*$/m, // --- dividers
];

export function segmentChapters(fullText: string): ChapterSegment[] {
    const lines = fullText.split('\n');
    const segments: ChapterSegment[] = [];
    let currentSegment: { title: string; startLine: number; lines: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line is a chapter marker
        let isChapterStart = false;
        let chapterTitle = '';

        for (const pattern of CHAPTER_PATTERNS) {
            const match = line.match(pattern);
            if (match) {
                isChapterStart = true;
                // Build chapter title from match groups
                if (match[3]) {
                    chapterTitle = match[1].trim() + ' ' + match[2] + ': ' + match[3];
                } else if (match[2]) {
                    chapterTitle = match[1].trim() + ' ' + match[2];
                } else if (match[1]) {
                    chapterTitle = match[1].trim();
                } else {
                    chapterTitle = line;
                }
                break;
            }
        }

        // Handle dividers as chapter breaks
        if (/^[*-]{3,}\s*$/.test(line)) {
            isChapterStart = true;
            chapterTitle = 'Section ' + String(segments.length + 1);
        }

        if (isChapterStart) {
            // Save previous segment
            if (currentSegment && currentSegment.lines.length > 0) {
                const content = currentSegment.lines.join('\n').trim();
                if (content.length > 100) {
                    // Minimum chapter length
                    segments.push({
                        title: currentSegment.title,
                        content,
                        startIndex: currentSegment.startLine,
                        endIndex: i - 1,
                    });
                }
            }

            // Start new segment
            currentSegment = {
                title: chapterTitle,
                startLine: i,
                lines: [],
            };
        } else if (currentSegment) {
            currentSegment.lines.push(lines[i]);
        } else {
            // Content before first chapter marker — create an implicit introduction segment
            currentSegment = {
                title: 'Introduction',
                startLine: 0,
                lines: [],
            };
            currentSegment.lines.push(lines[i]);
        }
    }

    // Don't forget the last segment
    if (currentSegment && currentSegment.lines.length > 0) {
        const content = currentSegment.lines.join('\n').trim();
        if (content.length > 100) {
            segments.push({
                title: currentSegment.title,
                content,
                startIndex: currentSegment.startLine,
                endIndex: lines.length - 1,
            });
        }
    }

    // If no chapters were found, create one chapter from all text
    if (segments.length === 0 && fullText.trim().length > 0) {
        segments.push({
            title: 'Full Text',
            content: fullText.trim(),
            startIndex: 0,
            endIndex: lines.length - 1,
        });
    }

    return segments;
}
