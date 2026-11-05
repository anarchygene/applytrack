import { z } from 'zod';
import { SOURCES, STAGES, WORK_MODES } from '../db/schema.js';
import { ERROR_CODES } from './errors.js';

export const stageSchema = z.enum(STAGES).meta({ id: 'Stage' });
export const workModeSchema = z.enum(WORK_MODES).meta({ id: 'WorkMode' });
export const sourceSchema = z.enum(SOURCES).meta({ id: 'Source' });

export const idParams = z.object({ id: z.uuid() });

/** Calendar date `YYYY-MM-DD` that is also a real date (rejects 2026-02-30). */
export const isoDate = z.iso.date();

export const isoDateTime = z.iso.datetime({ offset: true });

export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.enum(Object.keys(ERROR_CODES) as [keyof typeof ERROR_CODES]),
    detail: z.string(),
    requestId: z.string().optional(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    retryAfterSeconds: z.number().int().optional(),
  })
  .meta({ id: 'Problem', description: 'RFC 9457 problem details' });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}

/** Standard error responses to attach to route schemas so they appear in the OpenAPI document. */
export const errorResponses = {
  400: problemSchema,
  401: problemSchema,
  404: problemSchema,
} as const;

export const noContent = z.undefined().describe('No content');

/** OpenAPI security requirement for routes protected by `app.authenticate`. */
export const secured: { [scheme: string]: string[] }[] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/** Trims; turns empty strings into null so optional text fields can be cleared. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();
