/**
 * Lemniscate — Domain Errors
 * ----------------------------------------------------------------------------
 * Structured error hierarchy used by the service layer and API routes.
 * Each error carries a machine-readable `code` and an HTTP `statusCode`,
 * enabling the API error handler to translate domain errors into structured
 * HTTP responses without `switch` ladders.
 *
 * Design rules:
 *   - Every error extends `DomainError` (which extends `Error`).
 *   - `code` is a SCREAMING_SNAKE string used by clients for programmatic dispatch.
 *   - `statusCode` is the canonical HTTP status for this error class.
 *   - Optional `details` carries field-level validation info.
 */

/** Base class for all domain-layer errors. */
export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    if (details) this.details = details
    // Maintain proper prototype chain in ES5/TS
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ─── 4xx Errors ───────────────────────────────────────────────────────────

/** 400 — The request was malformed or failed validation. */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400
}

/** 401 — Authentication is required or has failed. */
export class AuthenticationError extends DomainError {
  readonly code = 'AUTHENTICATION_ERROR'
  readonly statusCode = 401
}

/** 403 — The authenticated principal lacks permission. */
export class AuthorizationError extends DomainError {
  readonly code = 'AUTHORIZATION_ERROR'
  readonly statusCode = 403
}

/** 404 — The requested resource does not exist. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404
}

/** 409 — The request conflicts with the current state of the resource. */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT'
  readonly statusCode = 409
}

/** 410 — The resource existed but has been permanently deleted. */
export class GoneError extends DomainError {
  readonly code = 'GONE'
  readonly statusCode = 410
}

/** 413 — The request payload exceeds the maximum allowed size. */
export class PayloadTooLargeError extends DomainError {
  readonly code = 'PAYLOAD_TOO_LARGE'
  readonly statusCode = 413
}

/** 415 — The media type is not supported. */
export class UnsupportedMediaTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE'
  readonly statusCode = 415
}

/** 422 — The request was syntactically valid but semantically incorrect. */
export class UnprocessableEntityError extends DomainError {
  readonly code = 'UNPROCESSABLE_ENTITY'
  readonly statusCode = 422
}

/** 429 — Too many requests in a given time window. */
export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED'
  readonly statusCode = 429
  readonly retryAfterSec?: number

  constructor(message: string, retryAfterSec?: number) {
    super(message)
    if (retryAfterSec !== undefined) this.retryAfterSec = retryAfterSec
  }
}

// ─── 5xx Errors ───────────────────────────────────────────────────────────

/** 500 — An unexpected internal error occurred. */
export class InternalServerError extends DomainError {
  readonly code = 'INTERNAL_ERROR'
  readonly statusCode = 500
}

/** 501 — The requested feature is not implemented. */
export class NotImplementedError extends DomainError {
  readonly code = 'NOT_IMPLEMENTED'
  readonly statusCode = 501
}

/** 503 — The service is temporarily unavailable. */
export class ServiceUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE'
  readonly statusCode = 503
}

// ─── Pipeline-specific errors ─────────────────────────────────────────────

/** The pipeline encountered an unrecoverable error during processing. */
export class PipelineError extends DomainError {
  readonly code = 'PIPELINE_ERROR'
  readonly statusCode = 500
  readonly stage?: string

  constructor(message: string, stage?: string) {
    super(message)
    if (stage) this.stage = stage
  }
}

/** A document parser could not extract text from the input file. */
export class ExtractionError extends DomainError {
  readonly code = 'EXTRACTION_ERROR'
  readonly statusCode = 422
}

// ─── Helper ───────────────────────────────────────────────────────────────

/** Type guard: is this error a DomainError? */
export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError
}

/**
 * Safely extract an HTTP status code from an unknown error.
 * Falls back to 500 for non-domain errors.
 */
export function getErrorStatusCode(err: unknown): number {
  if (isDomainError(err)) return err.statusCode
  return 500
}

/**
 * Safely extract a machine-readable error code from an unknown error.
 * Falls back to 'INTERNAL_ERROR' for non-domain errors.
 */
export function getErrorCode(err: unknown): string {
  if (isDomainError(err)) return err.code
  return 'INTERNAL_ERROR'
}