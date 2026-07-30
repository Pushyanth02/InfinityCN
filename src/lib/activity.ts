import { db } from "@/lib/db";

export async function logActivity(opts: {
  type: string;
  documentId?: string | null;
  detail?: string | null;
}) {
  try {
    await db.activityEvent.create({
      data: {
        type: opts.type,
        documentId: opts.documentId ?? null,
        detail: opts.detail ?? null,
      },
    });
  } catch {
    // ignore — activity logging is best-effort
  }
}
