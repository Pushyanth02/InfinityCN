/**
 * Lemniscate — Environment Variable Validation
 * ----------------------------------------------------------------------------
 * Validates required environment variables at startup. Fails immediately in
 * production if critical variables are missing.
 *
 * Two database backends are supported:
 *   • Self-hosted / local dev  → DATABASE_URL (file:./path.db)
 *   • Vercel / Turso serverless → LIBSQL_URL + LIBSQL_AUTH_TOKEN
 *
 * Either backend satisfies the "database configured" requirement. Spec
 * references: Security fix 2.1, Deployment fix 2.21
 */

import { createLogger } from './logger'
import { usesLibSQL } from './runtime'

const logger = createLogger('env')

interface EnvRule {
  name: string
  required: 'always' | 'production'
  description: string
  validate?: (value: string) => boolean
  /**
   * Optional gate: when provided and it returns false, the rule is skipped
   * entirely (neither required nor validated). Used so backend-specific vars
   * (e.g. LIBSQL_AUTH_TOKEN) only apply when that backend is actually in use.
   */
  appliesWhen?: () => boolean
}

const ENV_RULES: EnvRule[] = [
  {
    name: 'DATABASE_URL',
    required: 'always',
    description: 'SQLite database file path (e.g., file:./db/custom.db). Required when not using Turso (LIBSQL_URL).',
    validate: (v) => v.startsWith('file:'),
  },
  {
    name: 'LIBSQL_URL',
    required: 'always',
    description: 'Turso / libSQL database URL (e.g., libsql://<db>-<org>.turso.io). Required when not using a local file: DATABASE_URL.',
    validate: (v) => v.startsWith('libsql://') || v.startsWith('http://') || v.startsWith('https://'),
  },
  {
    name: 'LIBSQL_AUTH_TOKEN',
    required: 'production',
    description: 'Turso auth token. Required in production when using LIBSQL_URL.',
    // Only applies when the Turso/libSQL backend is in use. Self-hosted
    // deployments (local file: DATABASE_URL) never use a Turso token, so this
    // rule must not fire for them — otherwise a Docker production boot would
    // fail validation for a variable it legitimately does not need.
    appliesWhen: () => usesLibSQL(),
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

/**
 * Whether a database backend is configured. Either a local file: path
 * (DATABASE_URL) or a remote Turso database (LIBSQL_URL) satisfies this.
 */
function hasDatabaseBackend(): boolean {
  const dbUrl = process.env.DATABASE_URL
  const libsqlUrl = process.env.LIBSQL_URL
  return Boolean(dbUrl && dbUrl.trim()) || Boolean(libsqlUrl && libsqlUrl.trim())
}

export function validateEnvironment(): ValidationError[] {
  const isProduction = process.env.NODE_ENV === 'production'
  const errors: ValidationError[] = []

  // DATABASE_URL and LIBSQL_URL are alternatives — only one is required.
  // If a database backend is already configured, mark the other as optional
  // (skip the "missing" check) so a Vercel deployment (LIBSQL_URL only) does
  // not fail validation for the absent DATABASE_URL and vice-versa.
  const dbBackendPresent = hasDatabaseBackend()

  for (const rule of ENV_RULES) {
    // Skip rules gated to a backend that isn't active (e.g. LIBSQL_AUTH_TOKEN
    // on a self-hosted file: deployment). Neither required nor validated.
    if (rule.appliesWhen && !rule.appliesWhen()) {
      continue
    }

    const value = process.env[rule.name]
    const isDatabaseAlt = rule.name === 'DATABASE_URL' || rule.name === 'LIBSQL_URL'
    // An alternative database var is "required" only when no backend is set.
    const isRequired =
      isDatabaseAlt
        ? !dbBackendPresent
        : rule.required === 'always' || (rule.required === 'production' && isProduction)

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
    logger.info('Environment validation passed', { backend: usesLibSQL() ? 'libsql' : 'sqlite' })
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
