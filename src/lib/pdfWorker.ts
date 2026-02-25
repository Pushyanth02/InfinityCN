/**
 * pdfWorker.ts — Lazy PDF text extraction (V15 — batched)
 * pdfjs-dist is dynamically imported so it does NOT load on the initial page
 * load — it only downloads to the browser when the user actually drops a PDF.
 */

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
                        pages[i - 1] = content.items
                            .map(item => ('str' in item ? item.str : ''))
                            .join(' ');
                    }),
                );
            }
            await Promise.all(batch);
        }

        return pages.join('\n\n');
    } catch (error) {
        console.error('[pdfWorker] extraction failed:', error);
        throw new Error(
            'Failed to extract text. Please ensure the file is a valid, non-encrypted PDF.',
        );
    }
};
