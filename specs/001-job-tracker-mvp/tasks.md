---
description: "Task list for ApplyTrack job application tracker MVP"
---

# Tasks: ApplyTrack — Job Application Tracker MVP

**Input**: Design documents from `/specs/001-job-tracker-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md, quickstart.md

**Tests**: REQUIRED — Constitution II (Test-First Discipline) mandates HTTP-level integration tests
on real PostgreSQL for every user story and unit tests for domain logic.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
demonstrated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Paths are relative to the repository root (`apps/api`, `apps/web`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo, tooling and local database

- [ ] T001 Create npm workspaces root with scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:generate`, `openapi`) in package.json
- [ ] T002 Initialise API workspace with Fastify/Zod/Drizzle/pg/argon2 dependencies and strict ESM tsconfig in apps/api/package.json and apps/api/tsconfig.json
- [ ] T003 [P] Initialise web workspace with Vite + React 19 + React Router + TanStack Query + Tailwind 4 + openapi-fetch in apps/web/package.json, apps/web/vite.config.ts, apps/web/tsconfig.json
- [ ] T004 [P] Configure ESLint 10 flat config with typescript-eslint and Prettier in eslint.config.js and .prettierrc
- [ ] T005 [P] Add docker-compose.yml with `postgres:17` on port 5433 and an init script creating `applytrack` and `applytrack_test` databases in docker/initdb/01-test-db.sql
- [ ] T006 [P] Add apps/api/.env.example documenting `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `NODE_ENV`, `LOG_LEVEL`, `COOKIE_SECURE`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_ALLOW_DEMO`, `WEB_DIST_DIR`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config, database, error contract, auth plumbing and test harness used by every story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Implement Zod-validated environment config that fails fast with readable errors in apps/api/src/config.ts
- [ ] T008 Define full Drizzle schema (enums `stage`, `work_mode`, `source`; tables `users`, `sessions`, `applications`, `stage_events`, `reminders`, `tailorings` with constraints and indexes exactly as in data-model.md, including check `salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max`) in apps/api/src/db/schema.ts
- [ ] T009 Create pg Pool + Drizzle client factory in apps/api/src/db/client.ts and drizzle.config.ts
- [ ] T010 Generate initial migration in apps/api/drizzle/ and add migrate script in apps/api/scripts/migrate.ts
- [ ] T011 [P] Implement RFC 9457 problem+json `AppError` hierarchy with stable codes (`validation_failed`, `unauthorized`, `invalid_credentials`, `not_found`, `email_taken`, `stage_unchanged`, `invalid_transition`, `precondition_failed`, `rate_limited`, `ai_daily_limit`, `internal_error`, `ai_provider_error`, `ai_unavailable`) in apps/api/src/lib/errors.ts
- [ ] T012 [P] Implement shared Zod schemas (problem, pagination, ids, ISO date, enums) in apps/api/src/lib/schemas.ts
- [ ] T013 [P] Implement time-zone date helpers (`todayIn(tz)`, `dateIn(instant, tz)`, `addDays`, `isValidTimeZone`) in apps/api/src/domain/dates.ts
- [ ] T014 Implement `buildApp()` with Zod type provider, helmet, cookie, rate-limit, swagger + Scalar at `/docs`, request ids, pino redaction, global error handler mapping Zod/AppError/unknown errors to problem+json, `/health` and `/ready` in apps/api/src/app.ts
- [ ] T015 Implement entrypoint with listen and graceful SIGTERM/SIGINT shutdown in apps/api/src/server.ts
- [ ] T016 Implement session token utilities (32-byte base64url token, SHA-256 id, 7-day sliding expiry extended at most hourly) and `authenticate` preHandler decorating `request.user` from cookie `at_session` or Bearer header in apps/api/src/lib/auth.ts
- [ ] T017 Create test harness: `buildTestApp()` against `TEST_DATABASE_URL` with migrations applied once, `resetDb()` truncating all tables, and user/application factories in apps/api/test/helpers/
- [ ] T018 Configure Vitest (unit + integration projects, integration files sequential) in apps/api/vitest.config.ts
- [ ] T019 [P] Integration test for `/health`, `/ready`, `/docs/openapi.json` and problem+json shape for unknown route in apps/api/test/integration/platform.test.ts

**Checkpoint**: Foundation ready — `npm test` passes the platform test.

---

## Phase 3: User Story 1 — Record and find my job applications (Priority: P1) 🎯 MVP

**Goal**: Accounts with secure sessions plus full CRUD, search, filter, sort and pagination of applications, strictly isolated per user.

**Independent Test**: Two accounts; account A creates/lists/searches/edits/deletes; account B gets 404 for every A id.

### Tests for User Story 1

- [ ] T020 [P] [US1] Auth integration tests: register (email lower-cased, password ≥ 10 chars, `email_taken` case-insensitive), login, wrong password → `invalid_credentials`, logout revokes session, `GET/PATCH/DELETE /v1/me`, invalid timezone rejected, auth rate limit → 429 in apps/api/test/integration/auth.test.ts
- [ ] T021 [P] [US1] Applications integration tests: create (company/role required, 1–200 chars; `postingUrl` http(s) ≤ 2,048; salary min ≤ max; currency ISO 4217 default `SGD`; unknown fields rejected), get, patch, delete, list with `q`, `stage`, `workMode`, `source`, sort/order, pagination (default 20, max 100, beyond last page → empty) in apps/api/test/integration/applications.test.ts
- [ ] T022 [P] [US1] Isolation tests: every application/reminder/tailoring/timeline route with another user's id → 404 and no mutation in apps/api/test/integration/isolation.test.ts

### Implementation for User Story 1

- [ ] T023 [P] [US1] Users + sessions repository in apps/api/src/modules/auth/repository.ts
- [ ] T024 [US1] Auth service (argon2id hash/verify, register, login, logout, update profile, delete account, resume get/put ≤ 20,000 chars) in apps/api/src/modules/auth/service.ts
- [ ] T025 [US1] Auth + account routes with schemas, cookie handling and 10/min rate limit in apps/api/src/modules/auth/routes.ts
- [ ] T026 [P] [US1] Applications repository (all queries filtered by `user_id`; ILIKE search on company/role; dynamic filters/sort; count + page) in apps/api/src/modules/applications/repository.ts
- [ ] T027 [US1] Applications service (create with creation stage event, update, delete, get, list) in apps/api/src/modules/applications/service.ts
- [ ] T028 [US1] Applications routes and Zod schemas per contracts/http-api.md in apps/api/src/modules/applications/routes.ts and schemas.ts
- [ ] T029 [US1] Web: generated API client + auth context + protected routing in apps/web/src/api/ and apps/web/src/auth.tsx
- [ ] T030 [US1] Web: sign-in and register pages in apps/web/src/pages/Login.tsx and Register.tsx
- [ ] T031 [US1] Web: applications list with search, filters, sort, pagination and create/edit form in apps/web/src/pages/Applications.tsx and apps/web/src/components/ApplicationForm.tsx

**Checkpoint**: US1 fully functional and testable on its own.

---

## Phase 4: User Story 2 — Move applications through a hiring pipeline (Priority: P2)

**Goal**: Stage changes with validated transitions, recorded timeline, applied-date rule, board view.

**Independent Test**: Applied → Screening → Rejected gives three timeline entries in order; Rejected → Screening refused; Rejected → Applied allowed.

### Tests for User Story 2

- [ ] T032 [P] [US2] Unit tests for transition rules (closed stages only reopen to `applied`; same stage → `stage_unchanged`) in apps/api/test/unit/stages.test.ts
- [ ] T033 [P] [US2] Pipeline integration tests (timeline order, `occurredAt` back-dating not in future, `appliedOn` set once in user's time zone, note ≤ 1,000 chars) in apps/api/test/integration/pipeline.test.ts

### Implementation for User Story 2

- [ ] T034 [P] [US2] Pure transition logic in apps/api/src/domain/stages.ts
- [ ] T035 [US2] Transactional `changeStage` (event insert, applied_on rule, stage update) and timeline query in apps/api/src/modules/applications/service.ts and repository.ts
- [ ] T036 [US2] `POST /v1/applications/:id/stage` and `GET /v1/applications/:id/timeline` routes in apps/api/src/modules/applications/routes.ts
- [ ] T037 [US2] Web: board view grouped by stage with move controls in apps/web/src/pages/Board.tsx
- [ ] T038 [US2] Web: application detail page with timeline in apps/web/src/pages/ApplicationDetail.tsx

**Checkpoint**: US1 + US2 work independently.

---

## Phase 5: User Story 3 — Never forget a follow-up (Priority: P3)

**Goal**: Reminder CRUD, grouped due list in user's time zone, automatic 7-day follow-up on first apply.

**Independent Test**: Reminder due yesterday shows as overdue; next week as upcoming; completing removes it from the due list.

### Tests for User Story 3

- [ ] T039 [P] [US3] Unit tests for overdue/today/upcoming grouping across time zones in apps/api/test/unit/reminders.test.ts
- [ ] T040 [P] [US3] Reminder integration tests (CRUD, title 1–200 chars, complete/reopen, grouping, `includeCompleted`, `applicationId` filter, auto follow-up created once and not on reopen) in apps/api/test/integration/reminders.test.ts

### Implementation for User Story 3

- [ ] T041 [P] [US3] Pure grouping logic in apps/api/src/domain/reminders.ts
- [ ] T042 [US3] Reminders repository and service in apps/api/src/modules/reminders/repository.ts and service.ts
- [ ] T043 [US3] Hook auto follow-up creation into `changeStage`/create in apps/api/src/modules/applications/service.ts
- [ ] T044 [US3] Reminder routes in apps/api/src/modules/reminders/routes.ts
- [ ] T045 [US3] Web: reminders page and reminders panel on application detail in apps/web/src/pages/Reminders.tsx

**Checkpoint**: US1–US3 work independently.

---

## Phase 6: User Story 4 — Understand how my search is going (Priority: P4)

**Goal**: SQL-computed statistics exactly matching data-model.md definitions.

**Independent Test**: Seeded reference dataset yields hand-calculated values; empty account yields zeros and nulls.

### Tests for User Story 4

- [ ] T046 [P] [US4] Stats integration tests with a reference dataset (response rate 30% case, offer rate, avg days, 12 zero-filled ISO weeks, by-source) and empty account in apps/api/test/integration/stats.test.ts

### Implementation for User Story 4

- [ ] T047 [US4] Stats repository with aggregate SQL in apps/api/src/modules/stats/repository.ts
- [ ] T048 [US4] Stats service (rates, null handling, week zero-fill) and route in apps/api/src/modules/stats/service.ts and routes.ts
- [ ] T049 [US4] Web: stats page with stage counts, weekly bar chart and rates in apps/web/src/pages/Stats.tsx

**Checkpoint**: US1–US4 work independently.

---

## Phase 7: User Story 5 — Tailor my resume with AI (Priority: P5, optional)

**Goal**: Optional Claude-powered tailoring behind a provider interface with limits and graceful degradation.

**Independent Test**: With fake provider, tailoring is stored and listed; with no provider, `503 ai_unavailable` and all other tests still pass.

### Tests for User Story 5

- [ ] T050 [P] [US5] Tailoring integration tests (fake provider success, no resume / no job description → `precondition_failed`, 11th request in 24 h → `ai_daily_limit` with Retry-After, provider failure → `ai_provider_error` not counted, disabled → `ai_unavailable`, demo users blocked unless `AI_ALLOW_DEMO`) in apps/api/test/integration/tailoring.test.ts

### Implementation for User Story 5

- [ ] T051 [P] [US5] `TailoringProvider` interface, Claude implementation (forced tool call, Zod-validated output, 30 s timeout, input caps) and fake in apps/api/src/modules/tailoring/provider.ts
- [ ] T052 [US5] Tailoring repository and service (limit check, persistence) in apps/api/src/modules/tailoring/repository.ts and service.ts
- [ ] T053 [US5] AI status and tailoring routes in apps/api/src/modules/tailoring/routes.ts
- [ ] T054 [US5] Web: resume editor and tailoring panel (hidden when unavailable) in apps/web/src/pages/Resume.tsx and apps/web/src/components/TailoringPanel.tsx

**Checkpoint**: All stories work; AI is optional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T055 Demo account creation with realistic seed data and `POST /v1/auth/demo` (5/hour per IP) in apps/api/src/modules/auth/demo.ts
- [ ] T056 Demo cleanup job (startup + every 15 min, deletes demo users older than 24 h) in apps/api/src/jobs/demo-cleanup.ts
- [ ] T057 [P] Demo integration tests in apps/api/test/integration/demo.test.ts
- [ ] T058 OpenAPI export script + committed apps/api/openapi.json + web type generation in apps/api/scripts/export-openapi.ts
- [ ] T059 [P] OpenAPI completeness test (every route documented with response schemas) in apps/api/test/integration/openapi.test.ts
- [ ] T060 Serve built SPA with history fallback from the API in production in apps/api/src/app.ts
- [ ] T061 [P] Multi-stage Dockerfile and .dockerignore at repo root
- [ ] T062 [P] Render blueprint with pre-deploy migrations and health check in render.yaml
- [ ] T063 [P] GitHub Actions CI (lint, typecheck, Postgres service tests, OpenAPI drift check, web build) in .github/workflows/ci.yml
- [ ] T064 [P] README with overview, architecture diagram, API highlights, setup, testing, deployment and Spec Kit workflow in README.md
- [ ] T065 Run quickstart.md validation end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories → **Polish (Phase 8)**
- US1 is required by all other stories at runtime only for accounts/applications; each later story's
  tests create their own data through factories, so they remain independently testable.
- US3's auto follow-up (T043) hooks into US2's `changeStage` (T035).
- US4 reads stage events produced by US1/US2 code paths.
- US5 depends only on Foundational + US1 (applications, resume).

### Within Each User Story

- Tests are written first and must fail before implementation.
- Pure domain → repository → service → routes → web.

### Parallel Opportunities

- T003–T006 in parallel after T001–T002.
- T011–T013 in parallel; T019 alongside T016–T018.
- Within each story, all `[P]` test files and pure-domain modules in parallel.
- US4 and US5 can proceed in parallel once US2 is done.

### Parallel Example: User Story 1

```text
Task: "Auth integration tests in apps/api/test/integration/auth.test.ts"
Task: "Applications integration tests in apps/api/test/integration/applications.test.ts"
Task: "Isolation tests in apps/api/test/integration/isolation.test.ts"
Task: "Users + sessions repository in apps/api/src/modules/auth/repository.ts"
Task: "Applications repository in apps/api/src/modules/applications/repository.ts"
```

## Implementation Strategy

### MVP First

1. Phases 1–2 → foundation with platform test green.
2. Phase 3 (US1) → stop and validate: a usable tracker exists.
3. Deployable at this point.

### Incremental Delivery

US2 (pipeline) → US3 (reminders) → US4 (stats) → US5 (AI) → Polish (demo, docs, CI, deploy). Each
increment keeps the full test suite green and is committed separately.
