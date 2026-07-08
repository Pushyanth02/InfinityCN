/**
 * Lemniscate — Environment Variable Validation
 * ----------------------------------------------------------------------------
 * Validates required environment variables at startup. Fails immediately in
 * production if critical variables are missing.
 *
 * Spec references: Security fix 2.1, Deployment fix 2.21
 */

import { createLogger } from './logger'

const logger = createLogger('env')

interface EnvRule {
  name: string
  required: 'always' | 'production'
  description: string
  validate?: (value: string) => boolean
}

const ENV_RULES: EnvRule[] = [
  {
    name: 'DATABASE_URL',
    required: 'always',
    description: 'SQLite database file path (e.g., file:./db/custom.db)',
    validate: (v) => v.startsWith('file:'),
  },
  {
    name: 'LEMNISCATE_API_KEY',
    required: 'production',
    description: 'API key for authenticated access. Must be set in production.',
    validate: (v) => v.length >= 16,
  },
  {
    name: 'LEMNISCATE_ALLOWED_ORIGINS',
    required: 'production',
    description: 'Comma-separated list of allowed origins for CORS/CSRF (e.g., https://app.example.com)',
  },
]

export interface ValidationError {
  variable: string
  issue: 'missing' | 'invalid'
  description: string
}

export function validateEnvironment(): ValidationError[] {
  const isProduction = process.env.NODE_ENV === 'production'
  const errors: ValidationError[] = []

  for (const rule of ENV_RULES) {
    const value = process.env[rule.name]
    const isRequired = rule.required === 'always' || (rule.required === 'production' && isProduction)

    if (!value || value.trim() === '') {
      if (isRequired) {
        errors.push({
          variable: rule.name,
          issue: 'missing',
          description: rule.description,
        })
      }
      continue
    }

    if (rule.validate && !rule.validate(value)) {
      errors.push({
        variable: rule.name,
        issue: 'invalid',
        description: rule.description,
      })
    }
  }

  return errors
}

/**
 * Validate and fail fast if critical environment variables are missing.
 * In development, logs warnings. In production, throws to prevent startup.
 */
export function enforceEnvironment(): void {
  const errors = validateEnvironment()
  const isProduction = process.env.NODE_ENV === 'production'

  if (errors.length === 0) {
    logger.info('Environment validation passed')
    return
  }

  const summary = errors
    .map((e) => `  - ${e.variable}: ${e.issue} — ${e.description}`)
    .join('\n')

  if (isProduction) {
    logger.error(`Environment validation failed. Cannot start in production:\n${summary}`)
    throw new Error(
      `[FATAL] Missing or invalid environment variables:\n${summary}\n\n` +
      'Set the required variables and restart the application.',
    )
  } else {
    logger.warn(`Environment validation warnings (non-fatal in development):\n${summary}`)
  }
}
