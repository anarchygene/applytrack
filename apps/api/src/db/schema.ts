import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const STAGES = [
  'wishlist',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
] as const;
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export const SOURCES = [
  'linkedin',
  'company_site',
  'job_board',
  'referral',
  'recruiter',
  'career_fair',
  'other',
] as const;

export type Stage = (typeof STAGES)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type Source = (typeof SOURCES)[number];

export const stageEnum = pgEnum('stage', STAGES);
export const workModeEnum = pgEnum('work_mode', WORK_MODES);
export const sourceEnum = pgEnum('source', SOURCES);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    timezone: text('timezone').notNull().default('Asia/Singapore'),
    resumeText: text('resume_text'),
    isDemo: boolean('is_demo').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('users_demo_created_idx').on(t.createdAt).where(sql`${t.isDemo}`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    company: text('company').notNull(),
    role: text('role').notNull(),
    postingUrl: text('posting_url'),
    location: text('location'),
    workMode: workModeEnum('work_mode'),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    salaryCurrency: char('salary_currency', { length: 3 }).notNull().default('SGD'),
    source: sourceEnum('source'),
    jobDescription: text('job_description'),
    notes: text('notes'),
    stage: stageEnum('stage').notNull().default('wishlist'),
    appliedOn: date('applied_on', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    index('applications_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('applications_user_stage_idx').on(t.userId, t.stage),
    check(
      'applications_salary_range_chk',
      sql`${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMin} <= ${t.salaryMax}`,
    ),
  ],
);

export const stageEvents = pgTable(
  'stage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    fromStage: stageEnum('from_stage'),
    toStage: stageEnum('to_stage').notNull(),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stage_events_application_idx').on(t.applicationId, t.occurredAt)],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    isAuto: boolean('is_auto').notNull().default(false),
    ...timestamps,
  },
  (t) => [index('reminders_user_due_idx').on(t.userId, t.completedAt, t.dueOn)],
);

export const tailorings = pgTable(
  'tailorings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    bullets: jsonb('bullets').$type<string[]>().notNull(),
    missingKeywords: jsonb('missing_keywords').$type<string[]>().notNull(),
    summary: text('summary').notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tailorings_user_created_idx').on(t.userId, t.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type StageEventRow = typeof stageEvents.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;
export type TailoringRow = typeof tailorings.$inferSelect;
