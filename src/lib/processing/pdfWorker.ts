// ─── Text Normalization Utility ──────────────────────────
/**
 * Normalize extracted text: trims, collapses whitespace, removes invisible chars.
 */
function normalizeExtractedText(text: string): string {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width/invisible chars
        .replace(/\r\n|\r/g, '\n') // Normalize newlines
        .replace(/\s+$/gm, '') // Trim trailing whitespace on each line
        .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines to 2
        .replace(/[ \t]+/g, ' ') // Collapse spaces/tabs
        .trim();
}
/**
 * pdfWorker.ts — Document text extraction
 * Supports PDF, EPUB, DOCX, PPTX, and TXT formats.
 *
 * Heavy dependencies (pdfjs-dist, fflate) are dynamically imported so they
 * do NOT load on the initial page load — they only download when the user
 * actually drops a file.
 */

// ─── Supported Formats ────────────────────────────────────

export type SupportedFormat = 'pdf' | 'epub' | 'docx' | 'pptx' | 'txt';

const EXTENSION_MAP: Record<string, SupportedFormat> = {
    '.pdf': 'pdf',
    '.epub': 'epub',
    '.docx': 'docx',
    '.pptx': 'pptx',
    '.txt': 'txt',
};

const LEGACY_FORMATS = new Set(['.doc', '.ppt', '.xls']);

/** Maximum upload size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Detect the format from a File object.
 * Returns the format string, or throws if unsupported or too large.
 */
export function detectFormat(file: File): SupportedFormat {
    if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        throw new Error(`File is too large (${sizeMB} MB). Maximum allowed size is 50 MB.`);
    }

    const name = file.name.toLowerCase();
    const ext = name.substring(name.lastIndexOf('.'));

    if (LEGACY_FORMATS.has(ext)) {
        const modern = ext + 'x'; // .doc → .docx, .ppt → .pptx
        throw new Error(
            `Legacy ${ext} format is not supported. Please save the file as ${modern} and try again.`,
        );
    }

    const format = EXTENSION_MAP[ext];
    if (format) return format;

    // Fallback: check MIME type
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type === 'text/plain') return 'txt';
    if (file.type === 'application/epub+zip') return 'epub';
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        return 'docx';
    if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
        return 'pptx';

    throw new Error(
        `Unsupported file format "${ext}". Supported formats: PDF, EPUB, DOCX, PPTX, TXT.`,
    );
}

/** Accepted file extensions for the upload input */
export const ACCEPTED_EXTENSIONS = '.pdf,.epub,.docx,.pptx,.txt';

export type ExtractionStage = 'loading' | 'extracting' | 'ocr' | 'normalizing' | 'complete';

export interface ExtractionProgress {
    format: SupportedFormat;
    stage: ExtractionStage;
    percentComplete: number;
    message: string;
    pagesProcessed?: number;
    totalPages?: number;
    ocrPagesUsed?: number;
    ocrPageRatio?: number;
    ocrAverageConfidence?: number;
    lowConfidenceExtraction?: boolean;
    damagedPages?: number;
}

export type ExtractionProgressCallback = (progress: ExtractionProgress) => void;

function emitExtractionProgress(
    callback: ExtractionProgressCallback | undefined,
    progress: ExtractionProgress,
) {
    if (!callback) return;
    const clamped = Math.min(100, Math.max(0, progress.percentComplete));
    callback({ ...progress, percentComplete: clamped });
}

/**
 * Extract text from any supported document format.
 * Routes to the appropriate extractor based on file type.
 */
export async function extractText(
    file: File,
    onProgress?: ExtractionProgressCallback,
): Promise<string> {
    const format = detectFormat(file);
    let raw = '';

    emitExtractionProgress(onProgress, {
        format,
        stage: 'loading',
        percentComplete: 2,
        message: `Preparing ${format.toUpperCase()} extraction...`,
    });

    try {
        switch (format) {
            case 'txt':
                emitExtractionProgress(onProgress, {
                    format,
                    stage: 'extracting',
                    percentComplete: 25,
                    message: 'Reading text file...',
                });
                raw = await file.text();
                break;
            case 'pdf':
                return await extractPDFText(file, onProgress);
            case 'epub':
                emitExtractionProgress(onProgress, {
                    format,
                    stage: 'extracting',
                    percentComplete: 20,
                    message: 'Extracting EPUB chapters...',
                });
                raw = await extractTextFromEPUB(file);
                break;
            case 'docx':
                emitExtractionProgress(onProgress, {
                    format,
                    stage: 'extracting',
                    percentComplete: 20,
                    message: 'Extracting DOCX paragraphs...',
                });
                raw = await extractTextFromDOCX(file);
                break;
            case 'pptx':
                emitExtractionProgress(onProgress, {
                    format,
                    stage: 'extracting',
                    percentComplete: 20,
                    message: 'Extracting PPTX slides...',
                });
                raw = await extractTextFromPPTX(file);
                break;
        }
    } catch (err) {
        if (err instanceof Error) {
            throw new Error(`Failed to extract text from ${file.name}: ${err.message}`, {
                cause: err,
            });
        }
        throw err;
    }

    emitExtractionProgress(onProgress, {
        format,
        stage: 'normalizing',
        percentComplete: 96,
        message: 'Cleaning and normalizing text...',
    });

    const normalized = normalizeExtractedText(raw);

    emitExtractionProgress(onProgress, {
        format,
        stage: 'complete',
        percentComplete: 100,
        message: 'Text extraction complete.',
    });

    return normalized;
}

// ─── PDF Extraction ───────────────────────────────────────

type PDFTextItem = {
    str?: string;
    transform?: number[];
};

type PositionedToken = {
    text: string;
    x: number;
    y: number;
};

const PDF_LINE_Y_TOLERANCE = 3;
const OCR_LOW_CONFIDENCE_THRESHOLD = 60;
const MAX_OCR_PAGES = 5;

function getAdaptivePdfBatchSize(totalPages: number): number {
    const deviceMemory =
        typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number'
            ? navigator.deviceMemory
            : 4;

    if (deviceMemory <= 2) return totalPages > 250 ? 2 : 3;
    if (deviceMemory <= 4) return totalPages > 300 ? 3 : 5;
    if (deviceMemory <= 8) return totalPages > 350 ? 5 : 8;
    return totalPages > 450 ? 8 : 10;
}

function normalizeBoundaryLine(line: string): string {
    return line.trim().replace(/\d+/g, '__NUM__').replace(/\s+/g, ' ').toLowerCase();
}

function isBoundaryArtifact(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return true;

    const pageNumberPattern = /^(?:page\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?$/i;
    const punctuationOnlyPattern = /^[^\p{L}\p{N}]+$/u;
    return pageNumberPattern.test(trimmed) || punctuationOnlyPattern.test(trimmed);
}

function extractOrderedPageText(items: PDFTextItem[]): string {
    const tokens: PositionedToken[] = items
        .map(item => {
            const raw = item.str ?? '';
            const text = raw.replace(/\s+/g, ' ').trim();
            if (!text || !item.transform || item.transform.length < 6) return null;

            return {
                text,
                x: item.transform[4],
                y: item.transform[5],
            };
        })
        .filter((token): token is PositionedToken => token !== null)
        .sort((a, b) => {
            if (Math.abs(a.y - b.y) > PDF_LINE_Y_TOLERANCE) {
                return b.y - a.y;
            }
            return a.x - b.x;
        });

    if (tokens.length === 0) return '';

    const lines: string[] = [];
    let lineTokens: PositionedToken[] = [];
    let currentY = tokens[0].y;

    const flushLine = () => {
        if (lineTokens.length === 0) return;
        const text = lineTokens
            .sort((a, b) => a.x - b.x)
            .map(token => token.text)
            .join(' ')
            .replace(/\s+([,.;!?])/g, '$1')
            .trim();

        if (text) lines.push(text);
        lineTokens = [];
    };

    for (const token of tokens) {
        if (Math.abs(token.y - currentY) > PDF_LINE_Y_TOLERANCE) {
            flushLine();
            currentY = token.y;
        }
        lineTokens.push(token);
    }
    flushLine();

    return lines.join('\n');
}

function removeRecurringBoundaryArtifacts(pages: string[]): string[] {
    if (pages.length === 0) return [];

    const headerCounts = new Map<string, number>();
    const footerCounts = new Map<string, number>();
    const scanDepth = 3;

    const pageLines = pages.map(page =>
        page
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean),
    );

    for (const lines of pageLines) {
        const topCount = Math.min(scanDepth, lines.length);
        const bottomStart = Math.max(0, lines.length - scanDepth);

        for (let i = 0; i < topCount; i++) {
            const key = normalizeBoundaryLine(lines[i]);
            if (key) headerCounts.set(key, (headerCounts.get(key) ?? 0) + 1);
        }

        for (let i = bottomStart; i < lines.length; i++) {
            const key = normalizeBoundaryLine(lines[i]);
            if (key) footerCounts.set(key, (footerCounts.get(key) ?? 0) + 1);
        }
    }

    const recurrenceThreshold = Math.max(3, Math.ceil(pages.length * 0.25));
    const recurringHeaders = new Set(
        [...headerCounts.entries()]
            .filter(([, count]) => count >= recurrenceThreshold)
            .map(([k]) => k),
    );
    const recurringFooters = new Set(
        [...footerCounts.entries()]
            .filter(([, count]) => count >= recurrenceThreshold)
            .map(([k]) => k),
    );

    return pageLines.map(lines => {
        let start = 0;
        let end = lines.length - 1;

        while (start <= end) {
            const line = lines[start];
            const normalized = normalizeBoundaryLine(line);
            if (recurringHeaders.has(normalized) || isBoundaryArtifact(line)) {
                start++;
                continue;
            }
            break;
        }

        while (end >= start) {
            const line = lines[end];
            const normalized = normalizeBoundaryLine(line);
            if (recurringFooters.has(normalized) || isBoundaryArtifact(line)) {
                end--;
                continue;
            }
            break;
        }

        return lines.slice(start, end + 1).join('\n');
    });
}

/**
 * Extract plain text from a PDF while preserving page/line reading order.
 * Performs only text cleanup (artifact removal + whitespace normalization).
 */
export async function extractPDFText(
    file: File,
    onProgress?: ExtractionProgressCallback,
): Promise<string> {
    const format = detectFormat(file);
    if (format !== 'pdf') {
        throw new Error(`extractPDFText only supports PDF files (received ${format}).`);
    }

    const pages = await extractTextFromPDF(file, onProgress);

    emitExtractionProgress(onProgress, {
        format: 'pdf',
        stage: 'normalizing',
        percentComplete: 90,
        message: 'Removing headers, footers, and PDF artifacts...',
        pagesProcessed: pages.length,
        totalPages: pages.length,
    });

    const cleanedPages = removeRecurringBoundaryArtifacts(pages)
        .map(page => normalizeExtractedText(page))
        .filter(Boolean);

    const plainText = normalizeExtractedText(cleanedPages.join('\n\n'));

    emitExtractionProgress(onProgress, {
        format: 'pdf',
        stage: 'complete',
        percentComplete: 100,
        message: 'PDF extraction complete.',
        pagesProcessed: pages.length,
        totalPages: pages.length,
    });

    return plainText;
}

const extractTextFromPDF = async (
    file: File,
    onProgress?: ExtractionProgressCallback,
): Promise<string[]> => {
    emitExtractionProgress(onProgress, {
        format: 'pdf',
        stage: 'loading',
        percentComplete: 5,
        message: 'Loading PDF engine...',
    });

    // Dynamic import: pdfjs-dist (~400KB) downloads only when this runs
    let pdfjsLib: Awaited<typeof import('pdfjs-dist')>;
    try {
        const [lib, { default: workerSrc }] = await Promise.all([
            import('pdfjs-dist'),
            import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjsLib = lib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        emitExtractionProgress(onProgress, {
            format: 'pdf',
            stage: 'loading',
            percentComplete: 12,
            message: 'PDF engine ready.',
        });
    } catch {
        throw new Error('Failed to load PDF library. Please reload the page and try again.');
    }

    try {
        emitExtractionProgress(onProgress, {
            format: 'pdf',
            stage: 'loading',
            percentComplete: 14,
            message: 'Reading PDF file...',
        });

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        loadingTask.onProgress = (progressData: { loaded: number; total: number }) => {
            if (!progressData.total) return;
            const ratio = Math.min(1, Math.max(0, progressData.loaded / progressData.total));
            emitExtractionProgress(onProgress, {
                format: 'pdf',
                stage: 'loading',
                percentComplete: Math.round(15 + ratio * 15),
                message: `Loading PDF structure (${Math.round(ratio * 100)}%)...`,
            });
        };

        const pdf = await loadingTask.promise;
        emitExtractionProgress(onProgress, {
            format: 'pdf',
            stage: 'extracting',
            percentComplete: 30,
            message: `Extracting text from ${pdf.numPages} pages...`,
            pagesProcessed: 0,
            totalPages: pdf.numPages,
        });

        const pages: string[] = new Array(pdf.numPages);
        const batchSize = getAdaptivePdfBatchSize(pdf.numPages);
        let ocrPagesUsed = 0;
        let pagesProcessed = 0;
        let damagedPages = 0;
        let totalOcrConfidence = 0;
        let lowConfidenceOcrPages = 0;

        for (let start = 1; start <= pdf.numPages; start += batchSize) {
            const end = Math.min(start + batchSize - 1, pdf.numPages);
            const batch = [];
            for (let i = start; i <= end; i++) {
                batch.push(
                    pdf.getPage(i).then(async page => {
                        try {
                            const content = await page.getTextContent();
                            let pageText = extractOrderedPageText(content.items as PDFTextItem[]);

                            // OCR Fallback for scanned/image-based pages (limited scope)
                            if (pageText.trim().length < 50 && ocrPagesUsed < MAX_OCR_PAGES) {
                                emitExtractionProgress(onProgress, {
                                    format: 'pdf',
                                    stage: 'ocr',
                                    percentComplete: Math.round(
                                        30 + ((i - 1) / Math.max(1, pdf.numPages)) * 55,
                                    ),
                                    message: `Running OCR on page ${i}...`,
                                    pagesProcessed,
                                    totalPages: pdf.numPages,
                                    ocrPagesUsed,
                                    ocrPageRatio: ocrPagesUsed / Math.max(1, pdf.numPages),
                                });

                                ocrPagesUsed++;
                                try {
                                    const Tesseract = await import('tesseract.js');
                                    const viewport = page.getViewport({ scale: 1.5 });
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        canvas.height = viewport.height;
                                        canvas.width = viewport.width;
                                        await page.render({ canvas, canvasContext: ctx, viewport })
                                            .promise;
                                        const dataUrl = canvas.toDataURL('image/png');
                                        const result = await Tesseract.recognize(dataUrl, 'eng');
                                        pageText = result.data.text;
                                        const confidence = result.data.confidence ?? 0;
                                        totalOcrConfidence += confidence;
                                        if (confidence < OCR_LOW_CONFIDENCE_THRESHOLD) {
                                            lowConfidenceOcrPages++;
                                        }
                                        // Release canvas memory
                                        canvas.width = 0;
                                        canvas.height = 0;
                                    }
                                } catch (ocrErr) {
                                    console.warn('[pdfWorker] OCR failed on page', i, ':', ocrErr);
                                }
                            }

                            pages[i - 1] = pageText;
                        } catch (pageErr) {
                            damagedPages++;
                            console.warn('[pdfWorker] page extraction failed:', i, pageErr);
                            pages[i - 1] = '';
                        } finally {
                            pagesProcessed++;
                            const pageRatio = pagesProcessed / Math.max(1, pdf.numPages);
                            const ocrPageRatio = ocrPagesUsed / Math.max(1, pdf.numPages);
                            const ocrAverageConfidence =
                                ocrPagesUsed > 0 ? totalOcrConfidence / ocrPagesUsed : undefined;
                            emitExtractionProgress(onProgress, {
                                format: 'pdf',
                                stage: 'extracting',
                                percentComplete: Math.round(30 + pageRatio * 55),
                                message: `Extracted ${pagesProcessed} of ${pdf.numPages} pages...`,
                                pagesProcessed,
                                totalPages: pdf.numPages,
                                ocrPagesUsed,
                                ocrPageRatio,
                                ocrAverageConfidence,
                                lowConfidenceExtraction:
                                    lowConfidenceOcrPages > 0 &&
                                    lowConfidenceOcrPages / Math.max(1, ocrPagesUsed) >= 0.4,
                                damagedPages,
                            });
                            page.cleanup();
                        }
                    }),
                );
            }
            await Promise.all(batch);
        }

        const totalExtractedChars = pages.join('\n').trim().length;
        const ocrPageRatio = ocrPagesUsed / Math.max(1, pdf.numPages);
        if (totalExtractedChars < 100 && ocrPageRatio >= 0.5) {
            throw new Error(
                'Image-only PDF detected. Most pages appear scanned with low extractable text.',
            );
        }

        if (damagedPages > 0) {
            emitExtractionProgress(onProgress, {
                format: 'pdf',
                stage: 'extracting',
                percentComplete: 88,
                message: `Recovered with ${damagedPages} damaged page${damagedPages === 1 ? '' : 's'}.`,
                pagesProcessed,
                totalPages: pdf.numPages,
                ocrPagesUsed,
                ocrPageRatio,
                ocrAverageConfidence:
                    ocrPagesUsed > 0 ? totalOcrConfidence / ocrPagesUsed : undefined,
                damagedPages,
            });
        }

        return pages;
    } catch (error) {
        console.error('[pdfWorker] extraction failed:', error);
        const message = error instanceof Error ? error.message : String(error);
        const lower = message.toLowerCase();
        if (lower.includes('password') || lower.includes('encrypted')) {
            throw new Error('Encrypted PDF detected. Please provide a decrypted file.', {
                cause: error,
            });
        }
        if (lower.includes('xref') || lower.includes('cross-reference')) {
            throw new Error('Malformed xref table in PDF. The file structure is corrupted.', {
                cause: error,
            });
        }
        if (lower.includes('image-only pdf')) {
            throw new Error(message, { cause: error });
        }
        if (lower.includes('invalidpdf') || lower.includes('formaterror') || lower.includes('malformed')) {
            throw new Error('Corrupted PDF structure detected. Please re-export the PDF and retry.', {
                cause: error,
            });
        }
        throw new Error(
            'Failed to extract text from PDF. Please ensure the file is valid and not corrupted.',
            { cause: error },
        );
    }
};

// ─── ZIP Helper ───────────────────────────────────────────

type UnzippedFiles = Record<string, Uint8Array>;

/** Maximum decompressed size: 200 MB (zip bomb protection) */
const MAX_DECOMPRESSED_SIZE = 200 * 1024 * 1024;

async function unzipFile(file: File): Promise<UnzippedFiles> {
    const { unzipSync } = await import('fflate');
    const buffer = new Uint8Array(await file.arrayBuffer());
    try {
        const result = unzipSync(buffer);
        // Check total decompressed size to prevent zip bomb attacks
        let totalSize = 0;
        for (const key of Object.keys(result)) {
            totalSize += result[key].length;
            if (totalSize > MAX_DECOMPRESSED_SIZE) {
                throw new Error(
                    `Decompressed content exceeds ${MAX_DECOMPRESSED_SIZE / (1024 * 1024)} MB limit. The file may be corrupted or malicious.`,
                );
            }
        }
        return result;
    } catch (err) {
        if (err instanceof Error && err.message.includes('Decompressed content exceeds')) {
            throw err;
        }
        throw new Error(`Failed to read ${file.name}. The file may be corrupted.`, { cause: err });
    }
}

function decodeUTF8(data: Uint8Array): string {
    return new TextDecoder('utf-8').decode(data);
}

// ─── EPUB Extraction ──────────────────────────────────────

async function extractTextFromEPUB(file: File): Promise<string> {
    const files = await unzipFile(file);
    // 1. Read container.xml to find the OPF file
    const containerData = files['META-INF/container.xml'];
    if (!containerData) {
        throw new Error('Invalid EPUB: missing META-INF/container.xml');
    }
    const containerXml = decodeUTF8(containerData);
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    if (containerDoc.querySelector('parsererror')) {
        throw new Error('Invalid EPUB: container.xml is malformed');
    }
    const rootFileEl = containerDoc.querySelector('rootfile');
    const opfPath = rootFileEl?.getAttribute('full-path');
    if (!opfPath) {
        throw new Error('Invalid EPUB: cannot locate content file');
    }
    // 2. Read the OPF file to get the spine (reading order)
    const opfData = files[opfPath];
    if (!opfData) {
        throw new Error(`Invalid EPUB: missing content file at ${opfPath}`);
    }
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    const opfDoc = parser.parseFromString(decodeUTF8(opfData), 'application/xml');
    if (opfDoc.querySelector('parsererror')) {
        throw new Error('Invalid EPUB: content file is malformed');
    }
    // Build manifest map: id → href
    const manifest = new Map<string, string>();
    for (const item of opfDoc.querySelectorAll('manifest > item')) {
        const id = item.getAttribute('id');
        const href = item.getAttribute('href');
        if (id && href) {
            manifest.set(id, href);
        }
    }
    // Get spine order
    const spineItems: string[] = [];
    for (const itemref of opfDoc.querySelectorAll('spine > itemref')) {
        const idref = itemref.getAttribute('idref');
        if (idref) {
            const href = manifest.get(idref);
            if (href) spineItems.push(href);
        }
    }
    if (spineItems.length === 0) {
        throw new Error('Invalid EPUB: no readable content found in spine');
    }
    // 3. Extract text from each XHTML chapter in spine order (parallelized)
    const chapters: string[] = await Promise.all(
        spineItems.map(async href => {
            const filePath = opfDir + href;
            const data = files[filePath];
            if (!data) return '';
            const html = decodeUTF8(data);
            const doc = parser.parseFromString(html, 'application/xhtml+xml');
            const body = doc.querySelector('body');
            return body?.textContent?.trim() || '';
        }),
    );
    const filtered = chapters.filter(Boolean);
    if (filtered.length === 0) {
        throw new Error(
            'Could not extract text from EPUB. The file may be DRM-protected or empty.',
        );
    }
    return filtered.join('\n\n');
}

// ─── DOCX Extraction ─────────────────────────────────────

async function extractTextFromDOCX(file: File): Promise<string> {
    const files = await unzipFile(file);
    const docData = files['word/document.xml'];
    if (!docData) {
        throw new Error('Invalid DOCX: missing word/document.xml');
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(decodeUTF8(docData), 'application/xml');
    const WP_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = Array.from(doc.getElementsByTagNameNS(WP_NS, 'p'));
    // Parallelize extraction of paragraph text
    const textParts: string[] = await Promise.all(
        paragraphs.map(async para => {
            const textNodes = para.getElementsByTagNameNS(WP_NS, 't');
            const paraText: string[] = [];
            for (let j = 0; j < textNodes.length; j++) {
                const content = textNodes[j].textContent;
                if (content) paraText.push(content);
            }
            const joined = paraText.join('');
            return joined.trim() ? joined : '';
        }),
    );
    const filtered = textParts.filter(Boolean);
    if (filtered.length === 0) {
        throw new Error('Could not extract text from DOCX. The file may be empty or corrupted.');
    }
    return filtered.join('\n\n');
}

// ─── PPTX Extraction ─────────────────────────────────────

async function extractTextFromPPTX(file: File): Promise<string> {
    const files = await unzipFile(file);

    // Find all slide files and sort them numerically
    const slideFiles = Object.keys(files)
        .filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
        .sort((a, b) => {
            const numA = parseInt(a.match(/slide(\d+)/i)?.[1] ?? '0');
            const numB = parseInt(b.match(/slide(\d+)/i)?.[1] ?? '0');
            return numA - numB;
        });

    if (slideFiles.length === 0) {
        throw new Error('Invalid PPTX: no slides found');
    }

    const parser = new DOMParser();
    const DML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const slides: string[] = [];

    for (const slidePath of slideFiles) {
        const data = files[slidePath];
        if (!data) continue;

        const doc = parser.parseFromString(decodeUTF8(data), 'application/xml');
        const textNodes = doc.getElementsByTagNameNS(DML_NS, 't');
        const slideText: string[] = [];

        for (let i = 0; i < textNodes.length; i++) {
            const content = textNodes[i].textContent;
            if (content?.trim()) slideText.push(content.trim());
        }

        if (slideText.length > 0) {
            slides.push(slideText.join('\n'));
        }
    }

    if (slides.length === 0) {
        throw new Error('Could not extract text from PPTX. The slides may contain only images.');
    }

    return slides.join('\n\n');
}
