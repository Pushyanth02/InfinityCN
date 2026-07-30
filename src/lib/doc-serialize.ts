/**
 * Serialize a Prisma Document row into the JSON shape the client expects.
 *
 * Shared by the document/stories API routes so the mapping lives in exactly
 * one place (previously this was copy-pasted across three routes). Parses the
 * JSON-encoded `warnings`/`tags` columns and converts dates to ISO strings.
 */
export function rowFromDoc(d: any) {
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    sourceType: d.sourceType,
    mimeType: d.mimeType,
    byteSize: d.byteSize,
    status: d.status,
    error: d.error,
    warnings: d.warnings ? JSON.parse(d.warnings) : [],
    summary: d.summary,
    language: d.language,
    coverGradient: d.coverGradient,
    chapterCount: d.chapterCount,
    wordCount: d.wordCount,
    charCount: d.charCount,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    lastReadAt: d.lastReadAt ? d.lastReadAt.toISOString() : null,
    readingProgress: d.readingProgress,
    lastChunkIndex: d.lastChunkIndex,
    favorite: d.favorite,
    tags: JSON.parse(d.tags || "[]"),
    collection: d.collection,
  };
}
