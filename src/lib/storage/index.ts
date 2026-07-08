/**
 * Lemniscate — Local file storage
 * ----------------------------------------------------------------------------
 * Self-hosted friendly local storage for uploaded documents.
 * Files are written to `public/uploads/<sha256-prefix>/<storageName>` so they
 * can be served (in dev) and are kept outside source control.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Resolve the project root from this module's location so the upload dir is
 * identical whether accessed from the Next.js app or the worker mini-service.
 * `src/lib/storage/index.ts` → project root is 3 dirs up.
 * Falls back to UPLOAD_DIR env var, then process.cwd()/public/uploads.
 */
function resolveUploadRoot(): string {
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR
  try {
    // bun / ESM: import.meta.dir gives the directory of this file
    const here = (import.meta as ImportMeta & { dir?: string }).dir
    if (here) return path.resolve(here, '../../..', 'public', 'uploads')
  } catch {
    /* ignore */
  }
  return path.join(process.cwd(), 'public', 'uploads')
}

const UPLOAD_ROOT = resolveUploadRoot()

export async function ensureUploadDir(): Promise<string> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true })
  return UPLOAD_ROOT
}

/**
 * Resolve a storageName to an absolute path within UPLOAD_ROOT.
 * Throws if the resolved path escapes the upload directory (path traversal
 * defense-in-depth — callers already sanitize names, but this is a backstop).
 */
export function uploadPath(storageName: string): string {
  const resolved = path.resolve(UPLOAD_ROOT, storageName)
  const root = path.resolve(UPLOAD_ROOT)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Path traversal detected: storage name escapes upload directory')
  }
  return resolved
}

export function publicUrl(storageName: string): string {
  return `/uploads/${storageName}`
}

export async function saveBuffer(storageName: string, buf: Buffer): Promise<void> {
  await ensureUploadDir()
  await fs.writeFile(uploadPath(storageName), buf)
}

export async function readFile(storageName: string): Promise<Buffer> {
  return fs.readFile(uploadPath(storageName))
}

export async function deleteFile(storageName: string): Promise<void> {
  try {
    await fs.unlink(uploadPath(storageName))
  } catch {
    // ignore
  }
}

export function buildStorageName(originalName: string, fileHash: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.bin'
  const prefix = fileHash.slice(0, 12)
  const stamp = Date.now().toString(36)
  return `${prefix}-${stamp}${ext}`
}
