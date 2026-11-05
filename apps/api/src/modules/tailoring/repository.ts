import { and, count, desc, eq, gt, min } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { tailorings, type TailoringRow } from '../../db/schema.js';

export async function insertTailoring(
  db: DbOrTx,
  values: typeof tailorings.$inferInsert,
): Promise<TailoringRow> {
  const [row] = await db.insert(tailorings).values(values).returning();
  return row!;
}

export async function listTailorings(db: DbOrTx, userId: string, applicationId: string) {
  return db
    .select()
    .from(tailorings)
    .where(and(eq(tailorings.userId, userId), eq(tailorings.applicationId, applicationId)))
    .orderBy(desc(tailorings.createdAt));
}

/** Usage within the rolling window: how many, and when the oldest one happened. */
export async function usageSince(db: DbOrTx, userId: string, since: Date) {
  const [row] = await db
    .select({ used: count(), oldest: min(tailorings.createdAt) })
    .from(tailorings)
    .where(and(eq(tailorings.userId, userId), gt(tailorings.createdAt, since)));
  return { used: row?.used ?? 0, oldest: row?.oldest ?? null };
}
