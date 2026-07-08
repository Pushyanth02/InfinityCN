/**
 * Lemniscate — SQLite Database Backup
 * ----------------------------------------------------------------------------
 * Automated backup mechanism for the SQLite database file.
 * Copies the database to a backup directory on a configurable schedule,
 * retaining a configurable number of recent backups.
 *
 * Spec reference: Deployment fix 2.23
 */

import fs from 'node:fs'
import path from 'node:path'
import { createLogger } from './logger'

const logger = createLogger('backup')

const BACKUP_DIR = process.env.BACKUP_DIR || './backups'
const MAX_BACKUPS = parseInt(process.env.BACKUP_RETENTION_COUNT || '7', 10)
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10) * 60 * 60 * 1000

/**
 * Resolve the actual SQLite database file path from DATABASE_URL.
 */
function getDatabasePath(): string | null {
  const url = process.env.DATABASE_URL || ''
  // DATABASE_URL format: file:./db/custom.db or file:../relative/path.db
  if (!url.startsWith('file:')) return null
  const filePath = url.slice(5)
  return path.resolve(filePath)
}

/**
 * Perform a single backup of the SQLite database.
 */
export async function performBackup(): Promise<string | null> {
  const dbPath = getDatabasePath()
  if (!dbPath) {
    logger.warn('Cannot determine database path from DATABASE_URL')
    return null
  }

  if (!fs.existsSync(dbPath)) {
    logger.warn('Database file does not exist', { path: dbPath })
    return null
  }

  // Ensure backup directory exists
  const backupDir = path.resolve(BACKUP_DIR)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `lemniscate-backup-${timestamp}.db`
  const backupPath = path.join(backupDir, backupName)

  try {
    fs.copyFileSync(dbPath, backupPath)
    logger.info('Database backup created', { path: backupPath })

    // Prune old backups
    pruneBackups(backupDir)

    return backupPath
  } catch (err) {
    logger.error('Database backup failed', { error: (err as Error).message })
    return null
  }
}

/**
 * Remove old backups beyond the retention limit.
 */
function pruneBackups(backupDir: string): void {
  try {
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith('lemniscate-backup-') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        path: path.join(backupDir, f),
        mtime: fs.statSync(path.join(backupDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS)
      for (const file of toDelete) {
        fs.unlinkSync(file.path)
        logger.info('Pruned old backup', { file: file.name })
      }
    }
  } catch (err) {
    logger.warn('Backup pruning failed', { error: (err as Error).message })
  }
}

let backupTimer: ReturnType<typeof setInterval> | null = null

/**
 * Start the automated backup scheduler.
 * Only starts if BACKUP_ENABLED=true is set.
 */
export function startBackupScheduler(): void {
  if (process.env.BACKUP_ENABLED !== 'true') {
    logger.info('Automated backups disabled (set BACKUP_ENABLED=true to enable)')
    return
  }

  logger.info('Backup scheduler started', {
    intervalHours: BACKUP_INTERVAL_MS / (60 * 60 * 1000),
    retentionCount: MAX_BACKUPS,
    backupDir: BACKUP_DIR,
  })

  // Perform initial backup on startup
  performBackup().catch(() => {})

  backupTimer = setInterval(() => {
    performBackup().catch(() => {})
  }, BACKUP_INTERVAL_MS)

  // Don't prevent process exit
  backupTimer.unref?.()
}

/**
 * Stop the backup scheduler (for graceful shutdown).
 */
export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearInterval(backupTimer)
    backupTimer = null
  }
}
