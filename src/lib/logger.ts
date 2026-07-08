/**
 * Lemniscate — Structured Logger
 * ----------------------------------------------------------------------------
 * In production: emits JSON logs with timestamp, level, service, message, and metadata.
 * In development: uses console.* with readable formatting.
 *
 * Spec reference: Deployment fix 2.22
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  message: string
  [key: string]: unknown
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}
const MIN_LEVEL = IS_PRODUCTION ? 'INFO' : 'DEBUG'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL]
}

function emit(level: LogLevel, service: string, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return

  if (IS_PRODUCTION) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...meta,
    }
    const output = JSON.stringify(entry)
    if (level === 'ERROR') {
      process.stderr.write(output + '\n')
    } else {
      process.stdout.write(output + '\n')
    }
  } else {
    const prefix = `[${service}]`
    const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    switch (level) {
      case 'ERROR':
        console.error(`${prefix} ${message}${metaStr}`)
        break
      case 'WARN':
        console.warn(`${prefix} ${message}${metaStr}`)
        break
      case 'DEBUG':
        console.debug(`${prefix} ${message}${metaStr}`)
        break
      default:
        console.log(`${prefix} ${message}${metaStr}`)
    }
  }
}

export function createLogger(service: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => emit('DEBUG', service, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => emit('INFO', service, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => emit('WARN', service, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => emit('ERROR', service, message, meta),
  }
}

export type Logger = ReturnType<typeof createLogger>
