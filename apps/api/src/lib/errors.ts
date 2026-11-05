/**
 * RFC 9457 problem details with a stable, machine-readable `code`.
 * Every error the API returns goes through this module so clients see one shape.
 */
export const ERROR_CODES = {
  validation_failed: { status: 400, title: 'Bad Request' },
  unauthorized: { status: 401, title: 'Unauthorized' },
  invalid_credentials: { status: 401, title: 'Unauthorized' },
  not_found: { status: 404, title: 'Not Found' },
  email_taken: { status: 409, title: 'Conflict' },
  stage_unchanged: { status: 409, title: 'Conflict' },
  invalid_transition: { status: 409, title: 'Conflict' },
  precondition_failed: { status: 422, title: 'Unprocessable Content' },
  rate_limited: { status: 429, title: 'Too Many Requests' },
  ai_daily_limit: { status: 429, title: 'Too Many Requests' },
  internal_error: { status: 500, title: 'Internal Server Error' },
  ai_provider_error: { status: 502, title: 'Bad Gateway' },
  ai_unavailable: { status: 503, title: 'Service Unavailable' },
  not_ready: { status: 503, title: 'Service Unavailable' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export interface FieldError {
  path: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail: string;
  requestId?: string;
  errors?: FieldError[];
  retryAfterSeconds?: number;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly errors?: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    detail: string,
    extra: { errors?: FieldError[]; retryAfterSeconds?: number } = {},
  ) {
    super(detail);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.errors = extra.errors;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }

  toProblem(requestId?: string): Problem {
    return {
      type: 'about:blank',
      title: ERROR_CODES[this.code].title,
      status: this.status,
      code: this.code,
      detail: this.message,
      requestId,
      ...(this.errors ? { errors: this.errors } : {}),
      ...(this.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: this.retryAfterSeconds }
        : {}),
    };
  }
}

export const notFound = (what: string) => new AppError('not_found', `${what} not found`);
