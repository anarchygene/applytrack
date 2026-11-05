import type { Db } from '../../db/client.js';
import type { ApplicationRow, StageEventRow } from '../../db/schema.js';
import { addDays, dateIn } from '../../domain/dates.js';
import {
  checkTransition,
  createsFollowUp,
  FOLLOW_UP_DAYS,
  FOLLOW_UP_TITLE,
  SUBMITTED_STAGES,
  setsAppliedDate,
} from '../../domain/stages.js';
import type { AuthUser } from '../../lib/auth.js';
import { AppError, notFound } from '../../lib/errors.js';
import { insertReminder } from '../reminders/repository.js';
import * as repo from './repository.js';
import type {
  ApplicationCreateInput,
  ApplicationUpdateInput,
  ListQuery,
} from './schemas.js';

/** Allowance for client clocks running slightly ahead when back-dating stage changes. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function toSummaryDto(row: repo.ApplicationSummaryRow) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    postingUrl: row.postingUrl,
    location: row.location,
    workMode: row.workMode,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    source: row.source,
    stage: row.stage,
    appliedOn: row.appliedOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toApplicationDto(row: ApplicationRow) {
  return { ...toSummaryDto(row), jobDescription: row.jobDescription, notes: row.notes };
}

export function toStageEventDto(row: StageEventRow) {
  return {
    id: row.id,
    fromStage: row.fromStage,
    toStage: row.toStage,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
  };
}

function followUp(userId: string, applicationId: string, appliedOn: string) {
  return {
    userId,
    applicationId,
    title: FOLLOW_UP_TITLE,
    dueOn: addDays(appliedOn, FOLLOW_UP_DAYS),
    isAuto: true,
  };
}

export async function createApplication(
  db: Db,
  user: AuthUser,
  input: ApplicationCreateInput,
  now: Date,
): Promise<ApplicationRow> {
  const { stage = 'wishlist', appliedOn: suppliedAppliedOn, ...fields } = input;
  const appliedOn =
    suppliedAppliedOn ?? (SUBMITTED_STAGES.has(stage) ? dateIn(now, user.timezone) : null);

  return db.transaction(async (tx) => {
    const row = await repo.insertApplication(tx, { ...fields, userId: user.id, stage, appliedOn });
    await repo.insertStageEvent(tx, {
      applicationId: row.id,
      fromStage: null,
      toStage: stage,
      occurredAt: now,
    });
    if (appliedOn && createsFollowUp(null, stage)) {
      await insertReminder(tx, followUp(user.id, row.id, appliedOn));
    }
    return row;
  });
}

export async function getApplication(db: Db, user: AuthUser, id: string) {
  const row = await repo.findApplication(db, user.id, id);
  if (!row) throw notFound('Application');
  return row;
}

export async function updateApplication(
  db: Db,
  user: AuthUser,
  id: string,
  patch: ApplicationUpdateInput,
): Promise<ApplicationRow> {
  return db.transaction(async (tx) => {
    const existing = await repo.findApplication(tx, user.id, id, { forUpdate: true });
    if (!existing) throw notFound('Application');

    const salaryMin = patch.salaryMin !== undefined ? patch.salaryMin : existing.salaryMin;
    const salaryMax = patch.salaryMax !== undefined ? patch.salaryMax : existing.salaryMax;
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
      throw new AppError('validation_failed', 'Request validation failed', {
        errors: [
          { path: 'body.salaryMin', message: 'salaryMin must be less than or equal to salaryMax' },
        ],
      });
    }

    const updated = await repo.updateApplication(tx, user.id, id, patch);
    return updated!;
  });
}

export async function deleteApplication(db: Db, user: AuthUser, id: string): Promise<void> {
  if (!(await repo.deleteApplication(db, user.id, id))) throw notFound('Application');
}

export async function listApplications(db: Db, user: AuthUser, query: ListQuery) {
  const { items, total } = await repo.listApplications(db, user.id, query);
  return { items: items.map(toSummaryDto), page: query.page, pageSize: query.pageSize, total };
}

export async function changeStage(
  db: Db,
  user: AuthUser,
  id: string,
  input: { stage: ApplicationRow['stage']; note?: string | null; occurredAt?: string },
  now: Date,
): Promise<ApplicationRow> {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : now;
  if (occurredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    throw new AppError('validation_failed', 'Request validation failed', {
      errors: [{ path: 'body.occurredAt', message: 'Cannot be in the future' }],
    });
  }

  return db.transaction(async (tx) => {
    const app = await repo.findApplication(tx, user.id, id, { forUpdate: true });
    if (!app) throw notFound('Application');

    const transition = checkTransition(app.stage, input.stage);
    if (!transition.ok) throw new AppError(transition.code, transition.reason);

    await repo.insertStageEvent(tx, {
      applicationId: app.id,
      fromStage: app.stage,
      toStage: input.stage,
      note: input.note ?? null,
      occurredAt,
    });

    let appliedOn = app.appliedOn;
    if (setsAppliedDate(app.appliedOn, input.stage)) {
      appliedOn = dateIn(occurredAt, user.timezone);
      if (createsFollowUp(app.appliedOn, input.stage)) {
        await insertReminder(tx, followUp(user.id, app.id, appliedOn));
      }
    }

    const updated = await repo.updateApplication(tx, user.id, app.id, {
      stage: input.stage,
      appliedOn,
    });
    return updated!;
  });
}

export async function getTimeline(db: Db, user: AuthUser, id: string) {
  await getApplication(db, user, id);
  const events = await repo.listStageEvents(db, id);
  return events.map(toStageEventDto);
}
