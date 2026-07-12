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
  // Dev-only: resolve the project's public/uploads relative to THIS module so
  // the standalone Bun worker (whose cwd is mini-services/lemniscate-worker)
  // shares the Next.js app's upload directory. Gated on NODE_ENV so the
  // production build statically eliminates the module-relative `../../..`
  // computation — Turbopack inlines NODE_ENV and tree-shakes this branch, which
  // stops its NFT tracer from treating the upward path traversal as a signal to
  // trace the ENTIRE project into the standalone output. Production always sets
  // UPLOAD_DIR (see docker-compose), so this branch is never needed there.
  if (process.env.NODE_ENV !== 'production') {
    try {
      // bun / ESM: import.meta.dir is the directory of this file.
      const here = (import.meta as ImportMeta & { dir?: string }).dir
      if (here) return path.resolve(here, '../../..', 'public', 'uploads')
    } catch {
      /* ignore */
    }
  }
  return path.join(process.cwd(), 'public', 'uploads')
}

/**
 * Lazily resolve + memoize the upload root. Deferred out of module scope so the
 * production NFT tracer never encounters a filesystem-path computation at import
 * time (which it treats as a signal to trace the whole project into the
 * standalone output). Deterministic — the resolved value is identical to
 * computing it at module load, so behavior is unchanged.
 */
let cachedUploadRoot: string | null = null
function uploadRoot(): string {
  if (cachedUploadRoot === null) cachedUploadRoot = resolveUploadRoot()
  return cachedUploadRoot
}

export async function ensureUploadDir(): Promise<string> {
  const root = uploadRoot()
  await fs.mkdir(root, { recursive: true })
  return root
}

/**
 * Resolve a storageName to an absolute path within UPLOAD_ROOT.
 * Throws if the resolved path escapes the upload directory (path traversal
 * defense-in-depth — callers already sanitize names, but this is a backstop).
 */
export function uploadPath(storageName: string): string {
  const root = path.resolve(uploadRoot())
  const resolved = path.resolve(root, storageName)
  // `path.relative` is robust against Windows drive jumps and alternate path
  // forms that a naive `startsWith` prefix check can miss. If the resolved
  // path escapes the root, the relative path starts with `..`; if it lands on
  // a different root, `path.isAbsolute` catches it.
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
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
