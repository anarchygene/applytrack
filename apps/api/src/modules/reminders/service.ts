import type { Db } from '../../db/client.js';
import { todayIn } from '../../domain/dates.js';
import { groupReminders } from '../../domain/reminders.js';
import type { AuthUser } from '../../lib/auth.js';
import { notFound } from '../../lib/errors.js';
import { findApplication } from '../applications/repository.js';
import * as repo from './repository.js';

export function toReminderDto(row: repo.ReminderWithApplication) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    application: row.application,
    title: row.title,
    dueOn: row.dueOn,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    isAuto: row.isAuto,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listReminders(
  db: Db,
  user: AuthUser,
  filters: { includeCompleted: boolean; applicationId?: string },
  now: Date,
) {
  const today = todayIn(user.timezone, now);
  const rows = await repo.listReminders(db, user.id, filters);
  const groups = groupReminders(rows.map(toReminderDto), today);
  // Most recently completed first is more useful than due-date order for history.
  groups.completed.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { today, ...groups };
}

export async function createReminder(
  db: Db,
  user: AuthUser,
  applicationId: string,
  input: { title: string; dueOn: string },
) {
  const application = await findApplication(db, user.id, applicationId);
  if (!application) throw notFound('Application');
  const row = await repo.insertReminder(db, {
    userId: user.id,
    applicationId,
    title: input.title,
    dueOn: input.dueOn,
  });
  return toReminderDto({
    ...row,
    application: { company: application.company, role: application.role },
  });
}

export async function updateReminder(
  db: Db,
  user: AuthUser,
  id: string,
  input: { title?: string; dueOn?: string; completed?: boolean },
  now: Date,
) {
  const existing = await repo.findReminder(db, user.id, id);
  if (!existing) throw notFound('Reminder');
  const completedAt =
    input.completed === undefined
      ? undefined
      : input.completed
        ? (existing.completedAt ?? now)
        : null;
  await repo.updateReminder(db, user.id, id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
    ...(completedAt !== undefined ? { completedAt } : {}),
  });
  return toReminderDto((await repo.findReminder(db, user.id, id))!);
}

export async function deleteReminder(db: Db, user: AuthUser, id: string) {
  if (!(await repo.deleteReminder(db, user.id, id))) throw notFound('Reminder');
}
