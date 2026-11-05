import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { sessions, users, type UserRow } from '../../db/schema.js';

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  timezone?: string;
  isDemo?: boolean;
  resumeText?: string | null;
}

export async function insertUser(db: DbOrTx, input: NewUser): Promise<UserRow | null> {
  const rows = await db
    .insert(users)
    .values(input)
    .onConflictDoNothing({ target: users.email })
    .returning();
  return rows[0] ?? null;
}

export async function findUserByEmail(db: DbOrTx, email: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: DbOrTx, id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateUser(
  db: DbOrTx,
  id: string,
  patch: Partial<Pick<UserRow, 'name' | 'timezone' | 'resumeText'>>,
): Promise<UserRow | null> {
  const rows = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteUser(db: DbOrTx, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

export async function deleteDemoUsersCreatedBefore(db: DbOrTx, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(users)
    .where(and(eq(users.isDemo, true), lt(users.createdAt, cutoff)))
    .returning({ id: users.id });
  return rows.length;
}

export async function insertSession(
  db: DbOrTx,
  session: { id: string; userId: string; expiresAt: Date },
): Promise<void> {
  await db.insert(sessions).values(session);
}

export async function findActiveSession(db: DbOrTx, id: string, now: Date) {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function extendSession(db: DbOrTx, id: string, expiresAt: Date): Promise<void> {
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
}

export async function deleteSession(db: DbOrTx, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function deleteExpiredSessions(db: DbOrTx, now: Date): Promise<void> {
  await db.delete(sessions).where(sql`${sessions.expiresAt} <= ${now}`);
}
