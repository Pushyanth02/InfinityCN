import { db } from "@/lib/db";

/**
 * Record an activity event, scoped to a user for isolation.
 *
 * `userId` should be passed by callers that have a session. When it isn't
 * provided but a `documentId` is, the owning user is looked up from the
 * document so the event is still attributed correctly (documents enforce
 * ownership via their own `userId`). Activity logging is best-effort — any
 * failure is swallowed so it never breaks the primary request.
 */
export async function logActivity(opts: {
  type: string;
  documentId?: string | null;
  detail?: string | null;
  userId?: string | null;
}) {
  try {
    let userId = opts.userId ?? null;
    if (!userId && opts.documentId) {
      const doc = await db.document.findUnique({
        where: { id: opts.documentId },
        select: { userId: true },
      });
      userId = doc?.userId ?? null;
    }
    await db.activityEvent.create({
      data: {
        type: opts.type,
        documentId: opts.documentId ?? null,
        detail: opts.detail ?? null,
        userId,
      },
    });
  } catch {
    // ignore — activity logging is best-effort
  }
}
