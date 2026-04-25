/**
 * exportPipeline.ts — Book Export Pipeline
 *
 * Captures reader content and exports to PDF/text with full formatting.
 *
 * Architecture:
 *   1. ContentSerializer — converts chapters to export-ready HTML/text
 *   2. DOMCapture — renders content off-screen and captures to canvas
 *   3. PDFGenerator — assembles captured pages into a PDF document
 *   4. ExportOrchestrator — coordinates the full pipeline with progress
 *
 * Supports:
 *   - Original mode export (clean prose)
 *   - Cinematized mode export (blocks with annotations)
 *   - Plain text export
 *   - Full book or single chapter
 *   - Long chapter pagination (no truncation)
 *
 * Constraints:
 *   - Non-blocking (yields to event loop between pages)
 *   - Dynamic imports for jspdf (keep bundle light)
 *   - Maintains cinematic formatting in PDF output
 */

import type { Book, Chapter, CinematicBlock } from '../../types/cinematifier';

// ─── Export Types ──────────────────────────────────────────────────────────────

export type ExportMode = 'original' | 'cinematized';
export type ExportFormat = 'pdf' | 'txt';

export interface ExportOptions {
    /** Which mode to export */
    mode: ExportMode;
    /** Output format */
    format: ExportFormat;
    /** Specific chapter indices to export (default: all) */
    chapterIndices?: number[];
    /** Page dimensions in pt (default: A4 portrait) */
    pageWidth?: number;
    pageHeight?: number;
    /** Margins in pt */
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    /** Font size in pt */
    fontSize?: number;
    /** Line height multiplier */
    lineHeight?: number;
    /** Include title page */
    includeTitlePage?: boolean;
    /** Include chapter headers */
    includeChapterHeaders?: boolean;
    /** Progress callback */
    onProgress?: (progress: ExportProgress) => void;
    /** Abort signal */
    signal?: AbortSignal;
}

export interface ExportProgress {
    phase: 'preparing' | 'serializing' | 'rendering' | 'assembling' | 'complete';
    currentChapter: number;
    totalChapters: number;
    percentComplete: number;
    message: string;
}

export interface ExportResult {
    /** The generated blob (PDF or text) */
    blob: Blob;
    /** Suggested filename */
    filename: string;
    /** Format used */
    format: ExportFormat;
    /** Mode used */
    mode: ExportMode;
    /** Total pages (PDF only) */
    totalPages: number;
    /** Processing time in ms */
    processingTimeMs: number;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const DEFAULT_MARGIN = 56;
const DEFAULT_FONT_SIZE = 11;
const DEFAULT_LINE_HEIGHT = 1.6;

function resolveOptions(opts: ExportOptions): Required<ExportOptions> {
    return {
        mode: opts.mode,
        format: opts.format,
        chapterIndices: opts.chapterIndices ?? [],
        pageWidth: opts.pageWidth ?? A4_WIDTH_PT,
        pageHeight: opts.pageHeight ?? A4_HEIGHT_PT,
        marginTop: opts.marginTop ?? DEFAULT_MARGIN,
        marginBottom: opts.marginBottom ?? DEFAULT_MARGIN,
        marginLeft: opts.marginLeft ?? DEFAULT_MARGIN,
        marginRight: opts.marginRight ?? DEFAULT_MARGIN,
        fontSize: opts.fontSize ?? DEFAULT_FONT_SIZE,
        lineHeight: opts.lineHeight ?? DEFAULT_LINE_HEIGHT,
        includeTitlePage: opts.includeTitlePage ?? true,
        includeChapterHeaders: opts.includeChapterHeaders ?? true,
        onProgress: opts.onProgress ?? (() => {}),
        signal: opts.signal ?? new AbortController().signal,
    };
}

// ─── Content Serializer ────────────────────────────────────────────────────────

/** Serialized content for a single chapter, ready for rendering */
interface SerializedChapter {
    title: string;
    number: number;
    /** Array of text paragraphs (for text mode or original mode) */
    paragraphs: string[];
    /** Annotated blocks (for cinematized mode) */
    blocks: SerializedBlock[];
}

interface SerializedBlock {
    type: CinematicBlock['type'];
    content: string;
    speaker?: string;
    intensity: CinematicBlock['intensity'];
    timing?: CinematicBlock['timing'];
    emotion?: string;
    cameraDirection?: string;
}

function serializeChapter(chapter: Chapter, mode: ExportMode): SerializedChapter {
    if (mode === 'original') {
        const text = chapter.originalModeText ?? chapter.originalText;
        const paragraphs = text
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

        return {
            title: chapter.title,
            number: chapter.number,
            paragraphs,
            blocks: [],
        };
    }

    // Cinematized mode
    const blocks: SerializedBlock[] = (chapter.cinematifiedBlocks ?? []).map(block => ({
        type: block.type,
        content: block.content,
        speaker: block.speaker,
        intensity: block.intensity,
        timing: block.timing,
        emotion: block.emotion,
        cameraDirection: block.cameraDirection,
    }));

    return {
        title: chapter.title,
        number: chapter.number,
        paragraphs: [],
        blocks,
    };
}

function getExportChapters(book: Book, indices: number[]): Chapter[] {
    if (indices.length === 0) return book.chapters;
    return indices
        .filter(i => i >= 0 && i < book.chapters.length)
        .map(i => book.chapters[i]);
}

// ─── Text Export ───────────────────────────────────────────────────────────────

function buildPlainText(
    book: Book,
    chapters: SerializedChapter[],
    opts: Required<ExportOptions>,
): string {
    const lines: string[] = [];

    if (opts.includeTitlePage) {
        lines.push(book.title.toUpperCase());
        if (book.author) lines.push(`by ${book.author}`);
        lines.push('');
        lines.push('═'.repeat(60));
        lines.push('');
    }

    for (const chapter of chapters) {
        if (opts.includeChapterHeaders) {
            lines.push('');
            lines.push(`─── ${chapter.title} ───`);
            lines.push('');
        }

        if (opts.mode === 'original') {
            for (const para of chapter.paragraphs) {
                lines.push(para);
                lines.push('');
            }
        } else {
            for (const block of chapter.blocks) {
                const prefix = formatBlockPrefix(block);
                lines.push(prefix ? `${prefix} ${block.content}` : block.content);
                lines.push('');
            }
        }

        lines.push('');
    }

    return lines.join('\n').trim();
}

function formatBlockPrefix(block: SerializedBlock): string {
    switch (block.type) {
        case 'dialogue':
            return block.speaker ? `[${block.speaker}]` : '';
        case 'sfx':
            return '[SFX]';
        case 'beat':
            return '[BEAT]';
        case 'transition':
            return '[TRANSITION]';
        case 'chapter_header':
        case 'title_card':
            return '';
        default:
            return block.cameraDirection ? `[${block.cameraDirection}]` : '';
    }
}

// ─── PDF Text Layout Engine ───────────────────────────────────────────────────

interface PDFPage {
    lines: PDFLine[];
}

interface PDFLine {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic';
    color: [number, number, number];
    indent: number;
}

interface LayoutContext {
    pages: PDFPage[];
    currentPage: PDFPage;
    cursorY: number;
    contentWidth: number;
    contentHeight: number;
    opts: Required<ExportOptions>;
}

function createLayoutContext(opts: Required<ExportOptions>): LayoutContext {
    const firstPage: PDFPage = { lines: [] };
    return {
        pages: [firstPage],
        currentPage: firstPage,
        cursorY: opts.marginTop,
        contentWidth: opts.pageWidth - opts.marginLeft - opts.marginRight,
        contentHeight: opts.pageHeight - opts.marginTop - opts.marginBottom,
        opts,
    };
}

function newPage(ctx: LayoutContext): void {
    const page: PDFPage = { lines: [] };
    ctx.pages.push(page);
    ctx.currentPage = page;
    ctx.cursorY = ctx.opts.marginTop;
}

function remainingHeight(ctx: LayoutContext): number {
    return ctx.opts.pageHeight - ctx.opts.marginBottom - ctx.cursorY;
}

function lineHeightPt(ctx: LayoutContext, fontSize?: number): number {
    return (fontSize ?? ctx.opts.fontSize) * ctx.opts.lineHeight;
}

function addLine(
    ctx: LayoutContext,
    text: string,
    options?: {
        fontSize?: number;
        fontStyle?: PDFLine['fontStyle'];
        color?: [number, number, number];
        indent?: number;
    },
): void {
    const fs = options?.fontSize ?? ctx.opts.fontSize;
    const lh = lineHeightPt(ctx, fs);

    if (remainingHeight(ctx) < lh) {
        newPage(ctx);
    }

    ctx.currentPage.lines.push({
        text,
        x: ctx.opts.marginLeft + (options?.indent ?? 0),
        y: ctx.cursorY,
        fontSize: fs,
        fontStyle: options?.fontStyle ?? 'normal',
        color: options?.color ?? [0, 0, 0],
        indent: options?.indent ?? 0,
    });

    ctx.cursorY += lh;
}

function addSpacing(ctx: LayoutContext, lines = 1): void {
    const space = lineHeightPt(ctx) * lines;
    if (remainingHeight(ctx) < space) {
        newPage(ctx);
    } else {
        ctx.cursorY += space;
    }
}

/** Wrap text to fit within content width (approximate using avg char width) */
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
    // Approximate: avg character width ≈ fontSize * 0.5 for typical serif/sans
    const avgCharWidth = fontSize * 0.5;
    const maxChars = Math.max(20, Math.floor(maxWidth / avgCharWidth));

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (candidate.length > maxChars && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = candidate;
        }
    }

    if (currentLine) lines.push(currentLine);
    return lines.length > 0 ? lines : [''];
}

// ─── PDF Layout Builder ───────────────────────────────────────────────────────

function layoutTitlePage(ctx: LayoutContext, book: Book): void {
    addSpacing(ctx, 8);
    const titleLines = wrapText(book.title, 22, ctx.contentWidth);
    for (const line of titleLines) {
        addLine(ctx, line, { fontSize: 22, fontStyle: 'bold' });
    }
    addSpacing(ctx, 2);

    if (book.author) {
        addLine(ctx, `by ${book.author}`, { fontSize: 14, fontStyle: 'italic', color: [80, 80, 80] });
    }

    if (book.description) {
        addSpacing(ctx, 3);
        const descLines = wrapText(book.description, 10, ctx.contentWidth);
        for (const line of descLines) {
            addLine(ctx, line, { fontSize: 10, color: [100, 100, 100] });
        }
    }

    addSpacing(ctx, 4);
    addLine(ctx, `${book.totalChapters} chapter${book.totalChapters === 1 ? '' : 's'} · ${book.totalWordCount.toLocaleString()} words`, {
        fontSize: 9, color: [120, 120, 120],
    });

    newPage(ctx);
}

function layoutChapterHeader(ctx: LayoutContext, chapter: SerializedChapter): void {
    // Ensure at least 4 lines of space for header
    if (remainingHeight(ctx) < lineHeightPt(ctx, 16) * 4) {
        newPage(ctx);
    }

    addSpacing(ctx, 1);
    addLine(ctx, chapter.title, { fontSize: 16, fontStyle: 'bold' });
    addSpacing(ctx, 1);
}

function layoutOriginalChapter(ctx: LayoutContext, chapter: SerializedChapter): void {
    for (const para of chapter.paragraphs) {
        const lines = wrapText(para, ctx.opts.fontSize, ctx.contentWidth);
        for (let i = 0; i < lines.length; i++) {
            addLine(ctx, lines[i], { indent: i === 0 ? 20 : 0 });
        }
        addSpacing(ctx, 0.4);
    }
}

function layoutCinematizedChapter(ctx: LayoutContext, chapter: SerializedChapter): void {
    for (const block of chapter.blocks) {
        layoutBlock(ctx, block);
        addSpacing(ctx, 0.3);
    }
}

function layoutBlock(ctx: LayoutContext, block: SerializedBlock): void {
    const blockColor = getBlockColor(block.type);

    // Camera direction annotation
    if (block.cameraDirection) {
        addLine(ctx, `[${block.cameraDirection}]`, {
            fontSize: 8, fontStyle: 'italic', color: [140, 140, 140],
        });
    }

    // Speaker tag for dialogue
    if (block.type === 'dialogue' && block.speaker) {
        addLine(ctx, block.speaker.toUpperCase(), {
            fontSize: 9, fontStyle: 'bold', color: [60, 60, 60],
        });
    }

    // Block content
    const style: PDFLine['fontStyle'] =
        block.type === 'dialogue' ? 'italic' :
        block.type === 'chapter_header' || block.type === 'title_card' ? 'bold' :
        'normal';

    const fontSize = block.type === 'chapter_header' || block.type === 'title_card'
        ? ctx.opts.fontSize + 4
        : block.type === 'beat' || block.type === 'sfx'
        ? ctx.opts.fontSize - 1
        : ctx.opts.fontSize;

    const indent = block.type === 'dialogue' ? 24 : 0;
    const lines = wrapText(block.content, fontSize, ctx.contentWidth - indent);

    for (const line of lines) {
        addLine(ctx, line, { fontSize, fontStyle: style, color: blockColor, indent });
    }

    // Emotion/tension annotation
    if (block.emotion) {
        addLine(ctx, `${block.emotion}`, {
            fontSize: 7, fontStyle: 'italic', color: [160, 160, 160],
        });
    }
}

function getBlockColor(type: CinematicBlock['type']): [number, number, number] {
    switch (type) {
        case 'dialogue': return [30, 30, 30];
        case 'action': return [40, 40, 40];
        case 'sfx': return [100, 70, 30];
        case 'beat': return [80, 80, 80];
        case 'transition': return [100, 100, 100];
        case 'chapter_header':
        case 'title_card': return [10, 10, 10];
        default: return [0, 0, 0];
    }
}

// ─── PDF Generation (jsPDF) ───────────────────────────────────────────────────

async function loadJsPDF(): Promise<{ jsPDF: new (opts: Record<string, unknown>) => { addPage(): void; setFont(f: string, s: string): void; setFontSize(s: number): void; setTextColor(r: number, g: number, b: number): void; text(t: string, x: number, y: number, o?: Record<string, unknown>): void; output(t: string): Blob } }> {
    try {
        const moduleName = 'jspdf';
        return await import(/* @vite-ignore */ moduleName);
    } catch {
        throw new Error(
            'jspdf is not installed. Run: npm install jspdf'
        );
    }
}

async function renderPagesToPDF(
    pages: PDFPage[],
    opts: Required<ExportOptions>,
): Promise<Blob> {
    const { jsPDF } = await loadJsPDF();

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: [opts.pageWidth, opts.pageHeight],
    });

    for (let i = 0; i < pages.length; i++) {
        if (i > 0) doc.addPage();

        const page = pages[i];
        for (const line of page.lines) {
            const style = line.fontStyle === 'bolditalic' ? 'bolditalic' :
                line.fontStyle === 'bold' ? 'bold' :
                line.fontStyle === 'italic' ? 'italic' : 'normal';

            doc.setFont('helvetica', style);
            doc.setFontSize(line.fontSize);
            doc.setTextColor(line.color[0], line.color[1], line.color[2]);
            doc.text(line.text, line.x, line.y);
        }

        // Page number
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `${i + 1}`,
            opts.pageWidth / 2,
            opts.pageHeight - opts.marginBottom / 2,
            { align: 'center' },
        );
    }

    return doc.output('blob');
}

// ─── DOM Capture (optional, for visual fidelity export) ───────────────────────

/**
 * Capture a DOM element as a canvas image.
 * Uses html2canvas if available, falls back to native canvas drawing.
 */
export async function captureDOMElement(
    element: HTMLElement,
    options?: { scale?: number; backgroundColor?: string },
): Promise<HTMLCanvasElement> {
    const scale = options?.scale ?? 2;
    const bgColor = options?.backgroundColor ?? '#ffffff';

    // Try html2canvas first (optional peer dependency)
    // Use variable to bypass Vite's static import analysis
    try {
        const moduleName = 'html2canvas';
        const mod = await import(/* @vite-ignore */ moduleName);
        const html2canvas = mod.default ?? mod;
        return await html2canvas(element, {
            scale,
            backgroundColor: bgColor,
            useCORS: true,
            logging: false,
        });
    } catch {
        // Fallback: native canvas rendering from element dimensions
        return renderElementToCanvas(element, scale, bgColor);
    }
}

function renderElementToCanvas(
    element: HTMLElement,
    scale: number,
    bgColor: string,
): HTMLCanvasElement {
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    ctx.scale(scale, scale);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Extract computed styles and render text content
    const computedStyle = getComputedStyle(element);
    ctx.font = `${computedStyle.fontSize} ${computedStyle.fontFamily}`;
    ctx.fillStyle = computedStyle.color;

    const textContent = element.textContent ?? '';
    const lineHeight = parseInt(computedStyle.lineHeight) || 20;
    const maxWidth = rect.width - 40; // padding
    const words = textContent.split(/\s+/);
    let line = '';
    let y = lineHeight + 10;

    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
            ctx.fillText(line, 20, y);
            line = word;
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    if (line) ctx.fillText(line, 20, y);

    return canvas;
}

/**
 * Convert a canvas to a Blob.
 */
export function canvasToBlob(
    canvas: HTMLCanvasElement,
    type = 'image/png',
    quality = 0.92,
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
            type,
            quality,
        );
    });
}

// ─── Export Orchestrator ───────────────────────────────────────────────────────

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Export cancelled.');
}

function emitProgress(
    cb: ExportOptions['onProgress'],
    phase: ExportProgress['phase'],
    current: number,
    total: number,
    message: string,
): void {
    if (!cb) return;
    const percent = phase === 'complete' ? 100 :
        phase === 'preparing' ? 5 :
        Math.round(10 + (current / Math.max(1, total)) * 85);

    cb({ phase, currentChapter: current, totalChapters: total, percentComplete: percent, message });
}

/**
 * Export a book to PDF or plain text.
 *
 * This is the primary export entry point.
 */
export async function exportBook(
    book: Book,
    options: ExportOptions,
): Promise<ExportResult> {
    const startTime = performance.now();
    const opts = resolveOptions(options);
    const chapters = getExportChapters(book, opts.chapterIndices);

    if (chapters.length === 0) {
        throw new Error('No chapters available for export.');
    }

    checkAborted(opts.signal);
    emitProgress(opts.onProgress, 'preparing', 0, chapters.length, 'Preparing export...');

    // Serialize chapters
    emitProgress(opts.onProgress, 'serializing', 0, chapters.length, 'Serializing content...');
    const serialized: SerializedChapter[] = [];
    for (let i = 0; i < chapters.length; i++) {
        checkAborted(opts.signal);
        serialized.push(serializeChapter(chapters[i], opts.mode));
        emitProgress(opts.onProgress, 'serializing', i + 1, chapters.length, `Serialized chapter ${i + 1}...`);
    }

    // Plain text path
    if (opts.format === 'txt') {
        const text = buildPlainText(book, serialized, opts);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const filename = sanitizeFilename(book.title, opts.mode, 'txt');

        emitProgress(opts.onProgress, 'complete', chapters.length, chapters.length, 'Export complete.');

        return {
            blob, filename, format: 'txt', mode: opts.mode,
            totalPages: 0,
            processingTimeMs: Math.round(performance.now() - startTime),
        };
    }

    // PDF path
    emitProgress(opts.onProgress, 'rendering', 0, chapters.length, 'Laying out pages...');

    const ctx = createLayoutContext(opts);

    // Title page
    if (opts.includeTitlePage) {
        layoutTitlePage(ctx, book);
    }

    // Layout each chapter
    for (let i = 0; i < serialized.length; i++) {
        checkAborted(opts.signal);
        const chapter = serialized[i];

        if (opts.includeChapterHeaders) {
            layoutChapterHeader(ctx, chapter);
        }

        if (opts.mode === 'original') {
            layoutOriginalChapter(ctx, chapter);
        } else {
            layoutCinematizedChapter(ctx, chapter);
        }

        // Page break between chapters (except last)
        if (i < serialized.length - 1) {
            newPage(ctx);
        }

        emitProgress(opts.onProgress, 'rendering', i + 1, chapters.length, `Laid out chapter ${i + 1}...`);

        // Yield to event loop to keep UI responsive
        await new Promise(r => setTimeout(r, 0));
    }

    // Assemble PDF
    emitProgress(opts.onProgress, 'assembling', chapters.length, chapters.length, 'Generating PDF...');
    checkAborted(opts.signal);

    const blob = await renderPagesToPDF(ctx.pages, opts);
    const filename = sanitizeFilename(book.title, opts.mode, 'pdf');

    emitProgress(opts.onProgress, 'complete', chapters.length, chapters.length, 'Export complete.');

    return {
        blob, filename, format: 'pdf', mode: opts.mode,
        totalPages: ctx.pages.length,
        processingTimeMs: Math.round(performance.now() - startTime),
    };
}

/**
 * Export a single chapter.
 */
export async function exportChapter(
    book: Book,
    chapterIndex: number,
    options: Omit<ExportOptions, 'chapterIndices'>,
): Promise<ExportResult> {
    return exportBook(book, { ...options, chapterIndices: [chapterIndex] });
}

/**
 * Trigger a browser download of an export result.
 */
export function downloadExport(result: ExportResult): void {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // Cleanup
    setTimeout(() => {
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }, 100);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeFilename(title: string, mode: ExportMode, ext: string): string {
    const safe = title
        .replace(/[^a-zA-Z0-9\s\-_]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 60)
        .trim() || 'export';

    return `${safe}_${mode}.${ext}`;
}
