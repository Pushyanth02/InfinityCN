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

/**
 * Extract text from any supported document format.
 * Routes to the appropriate extractor based on file type.
 */
export async function extractText(file: File): Promise<string> {
    const format = detectFormat(file);

    switch (format) {
        case 'txt':
            return file.text();
        case 'pdf':
            return extractTextFromPDF(file);
        case 'epub':
            return extractTextFromEPUB(file);
        case 'docx':
            return extractTextFromDOCX(file);
        case 'pptx':
            return extractTextFromPPTX(file);
    }
}

// ─── PDF Extraction ───────────────────────────────────────

export const extractTextFromPDF = async (file: File): Promise<string> => {
    // Dynamic import: pdfjs-dist (~400KB) downloads only when this runs
    let pdfjsLib: Awaited<typeof import('pdfjs-dist')>;
    try {
        const [lib, { default: workerSrc }] = await Promise.all([
            import('pdfjs-dist'),
            import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjsLib = lib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    } catch {
        throw new Error('Failed to load PDF library. Please reload the page and try again.');
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = new Array(pdf.numPages);

        // Extract pages in batches of 10 for parallelism
        const BATCH = 10;
        for (let start = 1; start <= pdf.numPages; start += BATCH) {
            const end = Math.min(start + BATCH - 1, pdf.numPages);
            const batch = [];
            for (let i = start; i <= end; i++) {
                batch.push(
                    pdf.getPage(i).then(async page => {
                        const content = await page.getTextContent();

                        let pageText = '';
                        let lastY = -1;
                        for (const item of content.items as Array<{
                            str?: string;
                            transform?: number[];
                        }>) {
                            if (!item.str || !item.transform) continue;
                            const y = item.transform[5];
                            if (lastY !== -1 && Math.abs(y - lastY) > 5) {
                                pageText += '\n';
                            } else if (lastY !== -1 && item.str.trim()) {
                                pageText += ' ';
                            }
                            pageText += item.str;
                            lastY = y;
                        }

                        // OCR Fallback for scanned/image-based pages
                        if (pageText.trim().length < 50) {
                            try {
                                const Tesseract = await import('tesseract.js');
                                const viewport = page.getViewport({ scale: 1.5 });
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    canvas.height = viewport.height;
                                    canvas.width = viewport.width;
                                    await page.render({ canvasContext: ctx, viewport, canvas })
                                        .promise;
                                    const dataUrl = canvas.toDataURL('image/png');
                                    const result = await Tesseract.recognize(dataUrl, 'eng');
                                    pageText = result.data.text;
                                }
                            } catch (ocrErr) {
                                console.warn('[pdfWorker] OCR failed:', ocrErr);
                            }
                        }

                        pages[i - 1] = pageText;
                    }),
                );
            }
            await Promise.all(batch);
        }

        // Smart Header/Footer Detection via Frequency Analysis
        const firstLines = new Map<string, number>();
        const lastLines = new Map<string, number>();

        pages.forEach(page => {
            const lines = page
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean);
            if (lines.length > 0) {
                firstLines.set(lines[0], (firstLines.get(lines[0]) || 0) + 1);
                lastLines.set(
                    lines[lines.length - 1],
                    (lastLines.get(lines[lines.length - 1]) || 0) + 1,
                );
            }
        });

        // Threshold: 25% of pages or at least 3 pages
        const threshold = Math.max(3, pages.length * 0.25);
        const commonHeaders = new Set<string>();
        const commonFooters = new Set<string>();

        firstLines.forEach((count, line) => {
            if (count >= threshold) commonHeaders.add(line);
        });
        lastLines.forEach((count, line) => {
            if (count >= threshold) commonFooters.add(line);
        });

        const cleanedPages = pages.map(page => {
            const lines = page.split('\n');
            let startIdx = 0;
            let endIdx = lines.length - 1;

            while (startIdx <= endIdx) {
                const l = lines[startIdx].trim();
                // We strip exact matches. A more advanced approach could use Levenshtein or regex
                if (!l || commonHeaders.has(l)) startIdx++;
                else break;
            }
            while (endIdx >= startIdx) {
                const l = lines[endIdx].trim();
                if (!l || commonFooters.has(l)) endIdx--;
                else break;
            }
            return lines.slice(startIdx, endIdx + 1).join('\n');
        });

        return cleanedPages.join('\n\n');
    } catch (error) {
        console.error('[pdfWorker] extraction failed:', error);
        throw new Error(
            'Failed to extract text. Please ensure the file is a valid, non-encrypted PDF.',
        );
    }
};

// ─── ZIP Helper ───────────────────────────────────────────

type UnzippedFiles = Record<string, Uint8Array>;

async function unzipFile(file: File): Promise<UnzippedFiles> {
    const { unzipSync } = await import('fflate');
    const buffer = new Uint8Array(await file.arrayBuffer());
    try {
        return unzipSync(buffer);
    } catch {
        throw new Error(`Failed to read ${file.name}. The file may be corrupted.`);
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

    // 3. Extract text from each XHTML chapter in spine order
    const chapters: string[] = [];

    for (const href of spineItems) {
        const filePath = opfDir + href;
        const data = files[filePath];
        if (!data) continue;

        const html = decodeUTF8(data);
        const doc = parser.parseFromString(html, 'application/xhtml+xml');
        const body = doc.querySelector('body');
        if (body) {
            const text = body.textContent?.trim();
            if (text) chapters.push(text);
        }
    }

    if (chapters.length === 0) {
        throw new Error('Could not extract text from EPUB. The file may be DRM-protected.');
    }

    return chapters.join('\n\n');
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
    const paragraphs = doc.getElementsByTagNameNS(WP_NS, 'p');
    const textParts: string[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const textNodes = paragraphs[i].getElementsByTagNameNS(WP_NS, 't');
        const paraText: string[] = [];

        for (let j = 0; j < textNodes.length; j++) {
            const content = textNodes[j].textContent;
            if (content) paraText.push(content);
        }

        const joined = paraText.join('');
        if (joined.trim()) {
            textParts.push(joined);
        }
    }

    if (textParts.length === 0) {
        throw new Error('Could not extract text from DOCX. The file may be empty or corrupted.');
    }

    return textParts.join('\n\n');
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
