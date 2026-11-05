import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { applications, stageEvents, type ApplicationRow } from '../../db/schema.js';
import type { ListQuery } from './schemas.js';

export type ApplicationInsert = typeof applications.$inferInsert;
export type ApplicationPatch = Partial<Omit<ApplicationInsert, 'id' | 'userId' | 'createdAt'>>;

const ownedBy = (userId: string, id: string) =>
  and(eq(applications.id, id), eq(applications.userId, userId));

export async function insertApplication(
  db: DbOrTx,
  values: ApplicationInsert,
): Promise<ApplicationRow> {
  const [row] = await db.insert(applications).values(values).returning();
  return row!;
}

export async function findApplication(
  db: DbOrTx,
  userId: string,
  id: string,
  { forUpdate = false } = {},
): Promise<ApplicationRow | null> {
  const query = db.select().from(applications).where(ownedBy(userId, id)).limit(1);
  const rows = forUpdate ? await query.for('update') : await query;
  return rows[0] ?? null;
}

export async function updateApplication(
  db: DbOrTx,
  userId: string,
  id: string,
  patch: ApplicationPatch,
): Promise<ApplicationRow | null> {
  const rows = await db
    .update(applications)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownedBy(userId, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteApplication(db: DbOrTx, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(applications)
    .where(ownedBy(userId, id))
    .returning({ id: applications.id });
  return rows.length > 0;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

const SORT_COLUMNS = {
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
  appliedOn: applications.appliedOn,
  company: applications.company,
} as const;

const { jobDescription: _jd, notes: _notes, ...summaryColumns } = getTableColumns(applications);

export type ApplicationSummaryRow = Omit<ApplicationRow, 'jobDescription' | 'notes'>;

export async function listApplications(
  db: DbOrTx,
  userId: string,
  query: ListQuery,
): Promise<{ items: ApplicationSummaryRow[]; total: number }> {
  const conditions: SQL[] = [eq(applications.userId, userId)];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(or(ilike(applications.company, pattern), ilike(applications.role, pattern))!);
  }
  if (query.stage?.length) conditions.push(inArray(applications.stage, query.stage));
  if (query.workMode) conditions.push(eq(applications.workMode, query.workMode));
  if (query.source) conditions.push(eq(applications.source, query.source));
  const where = and(...conditions);

  const column = SORT_COLUMNS[query.sort];
  const direction = query.order === 'asc' ? asc : desc;
  const primary =
    query.sort === 'appliedOn'
      ? sql`${column} ${sql.raw(query.order === 'asc' ? 'ASC' : 'DESC')} NULLS LAST`
      : query.sort === 'company'
        ? direction(sql`lower(${column})`)
        : direction(column);

  const [items, totals] = await Promise.all([
    db
      .select(summaryColumns)
      .from(applications)
      .where(where)
      .orderBy(primary, desc(applications.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(applications).where(where),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

export async function insertStageEvent(db: DbOrTx, values: typeof stageEvents.$inferInsert) {
  const [row] = await db.insert(stageEvents).values(values).returning();
  return row!;
}

export async function listStageEvents(db: DbOrTx, applicationId: string) {
  return db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.applicationId, applicationId))
    .orderBy(asc(stageEvents.occurredAt), asc(stageEvents.id));
}
