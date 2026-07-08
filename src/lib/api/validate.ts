/**
 * Lemniscate — API Validation Schemas
 * ----------------------------------------------------------------------------
 * Zod schemas for validating API request parameters, query strings, and bodies.
 * These schemas serve dual purpose:
 *   1. Runtime validation in API route handlers.
 *   2. OpenAPI/JSON Schema generation for documentation.
 */

import { z } from 'zod'

// ─── Common primitives ────────────────────────────────────────────────────

/** CUID/UUID pattern for ID validation. */
export const idSchema = z.string().regex(/^[a-z0-9]{20,30}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid ID format')

/** Positive integer. */
export const positiveIntSchema = z.number().int().positive()

/** Bounded limit for pagination. */
export const limitSchema = z.number().int().min(1).max(200).default(50)

/** Non-negative offset for pagination. */
export const offsetSchema = z.number().int().min(0).default(0)

// ─── Document ─────────────────────────────────────────────────────────────

export const documentModeSchema = z.enum(['ORIGINAL', 'CINEMATIFIED', 'BOTH'])

export const uploadFormSchema = z.object({
  mode: documentModeSchema.default('BOTH'),
  priority: z.number().int().min(1).max(10).default(5),
})

export const documentListQuerySchema = z.object({
  status: z.enum(['UPLOADED', 'EXTRACTED', 'PROCESSED', 'FAILED']).optional(),
  limit: limitSchema,
  offset: offsetSchema,
  sortBy: z.enum(['createdAt', 'originalName', 'sizeBytes']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

// ─── Narrative ────────────────────────────────────────────────────────────

export const narrativeViewSchema = z.enum(['all', 'summary']).default('all')

export const narrativeDetailQuerySchema = z.object({
  view: narrativeViewSchema,
  paraLimit: z.number().int().min(1).max(200).default(50),
  paraOffset: z.number().int().min(0).default(0),
  sceneLimit: z.number().int().min(1).max(100).default(50),
  sceneOffset: z.number().int().min(0).default(0),
})

export const narrativeSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: z.enum(['paragraph', 'scene', 'character', 'event']).optional(),
  limit: limitSchema,
  offset: offsetSchema,
})

export const exportFormatSchema = z.enum(['markdown', 'html', 'epub', 'json', 'pdf'])

// ─── Job ──────────────────────────────────────────────────────────────────

export const jobStatusFilterSchema = z.enum([
  'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER',
]).optional()

export const jobListQuerySchema = z.object({
  status: jobStatusFilterSchema,
  documentId: idSchema.optional(),
  limit: limitSchema,
  offset: offsetSchema,
})

// ─── Reading Progress ─────────────────────────────────────────────────────

export const readingProgressSchema = z.object({
  scrollPct: z.number().int().min(0).max(100),
  sceneIndex: z.number().int().min(0).default(0),
  paragraphIdx: z.number().int().min(0).default(0),
})

// ─── Bookmark ─────────────────────────────────────────────────────────────

export const createBookmarkSchema = z.object({
  offset: z.number().int().min(0),
  sceneIndex: z.number().int().min(0).optional(),
  paragraphIdx: z.number().int().min(0).optional(),
  label: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
})

// ─── Helper: safe parse with error formatting ─────────────────────────────

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; details: Record<string, unknown> }

/**
 * Validate data against a Zod schema, returning a structured result.
 * Use with `ValidationError` from domain/errors for API responses.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  // Format Zod errors into a flat details object.
  const details: Record<string, unknown> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_'
    details[path] = issue.message
  }
  return {
    success: false,
    error: 'Validation failed',
    details,
  }
}