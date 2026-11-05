import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { applications, reminders, type ReminderRow } from '../../db/schema.js';

export type ReminderWithApplication = ReminderRow & {
  application: { company: string; role: string };
};

export async function insertReminder(
  db: DbOrTx,
  values: typeof reminders.$inferInsert,
): Promise<ReminderRow> {
  const [row] = await db.insert(reminders).values(values).returning();
  return row!;
}

const ownedBy = (userId: string, id: string) =>
  and(eq(reminders.id, id), eq(reminders.userId, userId));

export async function findReminder(
  db: DbOrTx,
  userId: string,
  id: string,
): Promise<ReminderWithApplication | null> {
  const rows = await selectWithApplication(db, [ownedBy(userId, id)!]);
  return rows[0] ?? null;
}

export async function listReminders(
  db: DbOrTx,
  userId: string,
  filters: { includeCompleted: boolean; applicationId?: string },
): Promise<ReminderWithApplication[]> {
  const conditions: SQL[] = [eq(reminders.userId, userId)];
  if (!filters.includeCompleted) conditions.push(isNull(reminders.completedAt));
  if (filters.applicationId) conditions.push(eq(reminders.applicationId, filters.applicationId));
  return selectWithApplication(db, conditions);
}

async function selectWithApplication(
  db: DbOrTx,
  conditions: SQL[],
): Promise<ReminderWithApplication[]> {
  const rows = await db
    .select({ reminder: reminders, company: applications.company, role: applications.role })
    .from(reminders)
    .innerJoin(applications, eq(applications.id, reminders.applicationId))
    .where(and(...conditions))
    .orderBy(asc(reminders.dueOn), asc(reminders.createdAt), asc(reminders.id));
  return rows.map((r) => ({ ...r.reminder, application: { company: r.company, role: r.role } }));
}

export async function updateReminder(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: Partial<Pick<ReminderRow, 'title' | 'dueOn' | 'completedAt'>>,
): Promise<boolean> {
  const rows = await db
    .update(reminders)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownedBy(userId, id))
    .returning({ id: reminders.id });
  return rows.length > 0;
}

export async function deleteReminder(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(reminders)
    .where(ownedBy(userId, id))
    .returning({ id: reminders.id });
  return rows.length > 0;
}
