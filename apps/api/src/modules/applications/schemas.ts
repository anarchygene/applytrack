import { z } from 'zod';
import {
  isoDate,
  isoDateTime,
  optionalText,
  paginationQuery,
  sourceSchema,
  stageSchema,
  workModeSchema,
} from '../../lib/schemas.js';

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

const salary = z.number().int().min(0).max(100_000_000).nullable().optional();

const applicationFields = {
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  postingUrl: z
    .url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })
    .max(2_048)
    .nullable()
    .optional(),
  location: optionalText(200),
  workMode: workModeSchema.nullable().optional(),
  salaryMin: salary,
  salaryMax: salary,
  salaryCurrency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => CURRENCIES.has(v), 'Must be an ISO 4217 currency code such as SGD')
    .optional(),
  source: sourceSchema.nullable().optional(),
  jobDescription: optionalText(20_000),
  notes: optionalText(10_000),
};

function salaryRangeValid(v: { salaryMin?: number | null; salaryMax?: number | null }) {
  return v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax;
}
const salaryRangeIssue = {
  message: 'salaryMin must be less than or equal to salaryMax',
  path: ['salaryMin'],
};

export const applicationCreateBody = z
  .strictObject({
    ...applicationFields,
    stage: stageSchema.optional(),
    appliedOn: isoDate.nullable().optional(),
  })
  .refine(salaryRangeValid, salaryRangeIssue);

export const applicationUpdateBody = z
  .strictObject({
    ...applicationFields,
    company: applicationFields.company.optional(),
    role: applicationFields.role.optional(),
    appliedOn: isoDate.nullable().optional(),
  })
  .refine(salaryRangeValid, salaryRangeIssue);

export type ApplicationCreateInput = z.output<typeof applicationCreateBody>;
export type ApplicationUpdateInput = z.output<typeof applicationUpdateBody>;

const summaryShape = {
  id: z.uuid(),
  company: z.string(),
  role: z.string(),
  postingUrl: z.string().nullable(),
  location: z.string().nullable(),
  workMode: workModeSchema.nullable(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  salaryCurrency: z.string(),
  source: sourceSchema.nullable(),
  stage: stageSchema,
  appliedOn: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const applicationSummarySchema = z
  .object(summaryShape)
  .meta({ id: 'ApplicationSummary', description: 'Application without long text fields' });

export const applicationSchema = z
  .object({
    ...summaryShape,
    jobDescription: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .meta({ id: 'Application' });

export const SORT_FIELDS = ['createdAt', 'updatedAt', 'appliedOn', 'company'] as const;

/** Query arrays arrive as a string for one value and an array for repeated keys. */
const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined || Array.isArray(v) ? v : [v]), z.array(item).optional());

export const listQuery = z.strictObject({
  ...paginationQuery.shape,
  q: z.string().trim().max(200).optional(),
  stage: oneOrMany(stageSchema),
  workMode: workModeSchema.optional(),
  source: sourceSchema.optional(),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListQuery = z.output<typeof listQuery>;

export const stageChangeBody = z.strictObject({
  stage: stageSchema,
  note: optionalText(1_000),
  occurredAt: isoDateTime.optional().describe('When the change happened; defaults to now'),
});

export const stageEventSchema = z
  .object({
    id: z.uuid(),
    fromStage: stageSchema.nullable(),
    toStage: stageSchema,
    note: z.string().nullable(),
    occurredAt: z.string(),
  })
  .meta({ id: 'StageEvent' });
