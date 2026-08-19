/**
 * Module declarations for assets imported dynamically.
 *
 * pdfjs-dist ships a worker as a separate ESM entry. The main `pdfjs-dist`
 * types don't declare the subpath, so we declare it here.
 */

declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
