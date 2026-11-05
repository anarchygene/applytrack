# HTTP API Contract: ApplyTrack v1

The machine-readable contract is generated from the route schemas and committed at
`apps/api/openapi.json` (CI fails if it drifts). This document is the human-readable design it must
match. All bodies are JSON; field names are camelCase; dates are `YYYY-MM-DD`; instants are ISO
8601 UTC.

## Conventions

- **Auth**: session cookie `at_session` (httpOnly) or `Authorization: Bearer <token>`. Routes marked
  🔒 return `401 unauthorized` without a valid session.
- **Ownership**: any 🔒 resource id that is not the caller's returns `404 not_found`.
- **Validation**: unknown body fields are rejected. Failures return `400 validation_failed` with
  `errors: [{ path, message }]`.
- **Errors** (`application/problem+json`, RFC 9457):

  ```json
  { "type": "about:blank", "title": "Not Found", "status": 404,
    "code": "not_found", "detail": "Application not found", "requestId": "..." }
  ```

  Codes: `validation_failed` 400, `unauthorized` 401, `invalid_credentials` 401, `not_found` 404,
  `email_taken` 409, `stage_unchanged` 409, `invalid_transition` 409, `precondition_failed` 422,
  `rate_limited` 429, `ai_daily_limit` 429, `internal_error` 500, `ai_provider_error` 502,
  `ai_unavailable` 503.
- **Pagination**: `?page=1&pageSize=20` (max 100) → `{ items, page, pageSize, total }`.

## Platform

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | 200 `{ status: "ok" }` |
| GET | `/ready` | 200 `{ status: "ok" }` / 503 when the database is unreachable |
| GET | `/docs` | Interactive API reference |
| GET | `/docs/openapi.json` | OpenAPI 3.1 document |

## Auth & account

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/v1/auth/register` | `{ email, name, password }` | 201 `{ user, token }` + cookie; 409 `email_taken` |
| POST | `/v1/auth/login` | `{ email, password }` | 200 `{ user, token }` + cookie; 401 `invalid_credentials` |
| POST | `/v1/auth/demo` | – | 201 `{ user, token }` + cookie (temporary demo account) |
| POST | `/v1/auth/logout` 🔒 | – | 204, session revoked, cookie cleared |
| GET | `/v1/me` 🔒 | – | 200 `User` |
| PATCH | `/v1/me` 🔒 | `{ name?, timezone? }` | 200 `User` |
| DELETE | `/v1/me` 🔒 | – | 204, all data deleted |
| GET | `/v1/me/resume` 🔒 | – | 200 `{ text: string \| null }` |
| PUT | `/v1/me/resume` 🔒 | `{ text }` | 200 `{ text }` |

`User` = `{ id, email, name, timezone, isDemo, createdAt }`.

## Applications

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/v1/applications` 🔒 | `q, stage (repeatable), workMode, source, sort (createdAt\|updatedAt\|appliedOn\|company), order (asc\|desc), page, pageSize` | 200 page of `Application` |
| POST | `/v1/applications` 🔒 | `ApplicationInput` | 201 `Application` |
| GET | `/v1/applications/:id` 🔒 | – | 200 `Application` |
| PATCH | `/v1/applications/:id` 🔒 | partial `ApplicationInput` without `stage` | 200 `Application` |
| DELETE | `/v1/applications/:id` 🔒 | – | 204 |
| POST | `/v1/applications/:id/stage` 🔒 | `{ stage, note?, occurredAt? }` | 200 `Application`; 409 `stage_unchanged` / `invalid_transition` |
| GET | `/v1/applications/:id/timeline` 🔒 | – | 200 `StageEvent[]` (oldest first) |

`ApplicationInput` = `{ company, role, postingUrl?, location?, workMode?, salaryMin?, salaryMax?,
salaryCurrency?, source?, jobDescription?, notes?, stage?, appliedOn? }`.
`Application` = input fields + `{ id, stage, appliedOn, createdAt, updatedAt }`.
`StageEvent` = `{ id, fromStage, toStage, note, occurredAt }`.

## Reminders

| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/v1/reminders` 🔒 | `includeCompleted?, applicationId?` | 200 `{ today: date, overdue, dueToday, upcoming, completed }` (arrays of `Reminder`; `completed` empty unless requested) |
| POST | `/v1/applications/:id/reminders` 🔒 | `{ title, dueOn }` | 201 `Reminder` |
| PATCH | `/v1/reminders/:id` 🔒 | `{ title?, dueOn?, completed? }` | 200 `Reminder` |
| DELETE | `/v1/reminders/:id` 🔒 | – | 204 |

`Reminder` = `{ id, applicationId, application: { company, role }, title, dueOn, completedAt,
isAuto, createdAt }`.

## Statistics

| Method | Path | Response |
|--------|------|----------|
| GET | `/v1/stats` 🔒 | 200 `Stats` |

```text
Stats = {
  totals: { all, submitted, responded, offers },
  byStage: { wishlist, applied, screening, interviewing, offer, accepted, rejected, withdrawn },
  responseRate: number | null,        // 0..1
  offerRate: number | null,           // 0..1
  avgDaysToFirstResponse: number | null,
  weekly: [{ weekStart: date, count }],   // 12 entries, oldest first
  bySource: [{ source, submitted, responded, responseRate }]
}
```

## AI tailoring

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/v1/ai/status` 🔒 | – | 200 `{ available, model, dailyLimit, usedToday }` |
| GET | `/v1/applications/:id/tailorings` 🔒 | – | 200 `Tailoring[]` (newest first) |
| POST | `/v1/applications/:id/tailorings` 🔒 | – | 201 `Tailoring`; 422 `precondition_failed` (no resume / no job description); 429 `ai_daily_limit` + `Retry-After`; 502 `ai_provider_error`; 503 `ai_unavailable` |

`Tailoring` = `{ id, applicationId, bullets: string[], missingKeywords: string[], summary, model,
createdAt }`.
