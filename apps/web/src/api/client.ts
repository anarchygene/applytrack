import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

type Schemas = components['schemas'];
export type User = Schemas['User'];
export type Application = Schemas['Application'];
export type ApplicationSummary = Schemas['ApplicationSummary'];
export type StageEvent = Schemas['StageEvent'];
export type Reminder = Schemas['Reminder'];
export type ReminderList = Schemas['ReminderList'];
export type Stats = Schemas['Stats'];
export type Tailoring = Schemas['Tailoring'];
export type AiStatus = Schemas['AiStatus'];
export type Problem = Schemas['Problem'];
export type Stage = Schemas['Stage'];
export type Source = Schemas['Source'];
export type WorkMode = Schemas['WorkMode'];

/** Typed client generated from the API's OpenAPI document (apps/api/openapi.json). */
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' });

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Partial<Problem>,
  ) {
    super(problem.detail ?? `Request failed (${status})`);
    this.name = 'ApiError';
  }

  /** Field-level message for a body field, if the API reported one. */
  fieldError(field: string): string | undefined {
    return this.problem.errors?.find((e) => e.path === `body.${field}`)?.message;
  }
}

/** Resolves an openapi-fetch call to its data or throws an `ApiError` with the problem details. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) {
    const problem =
      error && typeof error === 'object' ? (error as Partial<Problem>) : { detail: undefined };
    throw new ApiError(response.status, problem);
  }
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';
