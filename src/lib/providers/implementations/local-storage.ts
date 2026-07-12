/**
 * Lemniscate — Local Storage Provider
 * ----------------------------------------------------------------------------
 * Wraps the existing `storage/index.ts` module behind the `IStorageProvider`
 * interface. Files are stored on the local filesystem.
 */

import {
  saveBuffer,
  readFile,
  deleteFile,
  uploadPath,
  publicUrl,
  buildStorageName,
  ensureUploadDir,
} from '@/lib/storage'
import type { IStorageProvider } from '../types'

export class LocalStorageProvider implements IStorageProvider {
  readonly name = 'local'

  async save(key: string, data: Buffer): Promise<void> {
    await saveBuffer(key, data)
  }

  async read(key: string): Promise<Buffer> {
    return readFile(key)
  }

  async delete(key: string): Promise<void> {
    return deleteFile(key)
  }

  async exists(key: string): Promise<boolean> {
    try {
      uploadPath(key) // throws on path traversal
      const fs = await import('node:fs/promises')
      await fs.access(uploadPath(key))
      return true
    } catch {
      return false
    }
  }

  getUrl(key: string): string {
    return publicUrl(key)
  }
}

// Re-export helpers for backward compatibility
export { buildStorageName, ensureUploadDir, uploadPath }