import { z } from "zod";

/**
 * Shared Zod schemas for API request validation.
 * Every POST API route should validate its body with one of these schemas
 * (or a route-specific schema) before processing.
 */

/** CUID document ID format. */
const cuid = z.string().regex(/^[a-z0-9]{20,30}$/i, "Invalid document ID");

/** Base schema for most AI routes — just a documentId. */
export const documentIdSchema = z.object({
  documentId: cuid,
});

/** Schema for chapter-scoped AI routes. */
export const chapterScopedSchema = z.object({
  documentId: cuid,
  chapterIndex: z.number().int().min(0).optional(),
});

/** Schema for chat routes (Luma, Ouro). */
export const chatSchema = z.object({
  documentId: cuid,
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(8000),
    }),
  ).max(20),
  chapterIndex: z.number().int().min(0).optional(),
});

/** Schema for Ouro tool routes. */
export const ouroSchema = z.object({
  documentId: cuid,
  tool: z.enum(["chat", "guide", "quiz", "flashcards"]).default("chat"),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(8000),
    }),
  ).max(20).optional(),
  chapterIndex: z.number().int().min(0).optional(),
});

/** Schema for Ankaa long-form writing. */
export const ankaaSchema = z.object({
  documentId: z.string().optional(), // optional — Ankaa can write from brief alone
  prompt: z.string().min(3).max(4000),
  chapterIndex: z.number().int().min(0).optional(),
  wordTarget: z.number().int().min(100).max(2000).optional(),
});

/** Schema for the Q&A route. */
export const qaSchema = z.object({
  documentId: cuid,
  question: z.string().min(1).max(2000),
});

/** Schema for the summarize route. */
export const summarizeSchema = z.object({
  documentId: cuid,
  scope: z.enum(["chapter", "novel"]),
  chapterIndex: z.number().int().min(0).optional(),
  regenerate: z.boolean().optional(),
});

/** Schema for the scenes route. */
export const scenesSchema = z.object({
  documentId: cuid,
  regenerate: z.boolean().optional(),
});

/** Schema for the alternate-ending route. */
export const alternateEndingSchema = z.object({
  documentId: cuid,
  twist: z.string().max(2000).optional(),
});

/** Schema for the luma-create (co-writer) route. */
export const lumaCreateSchema = z.object({
  draft: z.string().max(10000),
  prompt: z.string().min(1).max(2000),
});

/** Schema for the stories (create) route. */
export const createStorySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10).max(500000),
  author: z.string().max(200).optional(),
});

/** Schema for the structure (OCR refine) route. */
export const structureSchema = z.object({
  text: z.string().min(10).max(20000),
  chapterTitle: z.string().max(200).optional(),
  chapterIndex: z.number().int().min(0).optional(),
  regenerate: z.boolean().optional(),
});

/**
 * Validate a request body against a Zod schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validate<T>(schema: z.ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstError = result.error.issues[0];
  return { success: false, error: firstError?.message ?? "Invalid request" };
}
