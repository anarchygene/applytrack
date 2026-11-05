# ApplyTrack Constitution

## Core Principles

### I. API-First, Contract-Driven

The HTTP API is the product; the web dashboard is one client of it.

- Every endpoint MUST declare request and response schemas (Zod) that are the single source of
  truth for runtime validation, TypeScript types, and the published OpenAPI document.
- The OpenAPI document MUST be generated from code and served at `/docs`; hand-written,
  drifting API docs are not permitted.
- Errors MUST use one consistent shape (RFC 9457 `application/problem+json`) with a stable,
  machine-readable `code`.
- Breaking changes to a published route MUST go behind a new version prefix (`/v2`), never
  silently change `/v1`.

Rationale: a contract that is enforced at runtime cannot drift from its documentation, and
consumers (including our own frontend) can rely on it.

### II. Test-First Discipline (NON-NEGOTIABLE)

- Each user story MUST have automated tests that exercise it end-to-end through the HTTP layer
  before it is considered done.
- Integration tests MUST run against a real PostgreSQL instance, not mocks of the database.
- Pure domain logic (status transitions, statistics, reminder scheduling) MUST have unit tests.
- External services (the LLM provider) MUST be faked behind an interface in tests; tests MUST
  NOT make network calls to third parties.
- The `main` branch MUST stay green: lint, type-check, and all tests pass in CI.

Rationale: tests against the real database catch the bugs that matter in a data-centric API
(constraints, transactions, query correctness) and make refactoring safe.

### III. Secure by Default

- Passwords MUST be hashed with a memory-hard algorithm (argon2id); plaintext or reversible
  storage is forbidden.
- Every query on user-owned data MUST be scoped by the authenticated user's id at the repository
  layer; a request for another user's resource returns `404`, never the resource.
- All input MUST be validated at the boundary; unknown fields are rejected.
- Authentication and AI endpoints MUST be rate-limited.
- Secrets MUST come from environment variables only and MUST NOT be committed, logged, or
  returned in responses. Logs MUST NOT contain passwords, tokens, or full resume text.

Rationale: a job tracker holds personal career data; leaking it across accounts is the most
serious failure this system can have.

### IV. Layered Simplicity

- Code is organised as routes → services → repositories. Route handlers translate HTTP only;
  business rules live in services; SQL lives in repositories.
- New dependencies, abstractions, or infrastructure (queues, caches, extra services) MUST be
  justified by a current requirement, not a hypothetical one (YAGNI).
- Prefer a single deployable API process plus PostgreSQL; background work runs in-process until
  load proves otherwise.

Rationale: a small, legible codebase is easier to review, explain, and extend.

### V. Observable and Operable

- Logs MUST be structured JSON (pino) and carry a per-request id.
- The service MUST expose `GET /health` (liveness) and `GET /ready` (checks the database).
- Configuration MUST follow twelve-factor rules: read from the environment, validated at
  startup, failing fast with a clear message when invalid.
- The process MUST shut down gracefully on `SIGTERM` (stop accepting requests, drain, close the
  pool).
- Database schema changes MUST ship as versioned, committed migrations.

Rationale: a service that can be diagnosed and deployed safely is what distinguishes production
work from a demo.

### VI. Optional Integrations Degrade Gracefully

- Third-party integrations (the Claude API) MUST be optional: the application MUST start and
  all core features MUST work when the integration is not configured.
- Calls to third parties MUST have timeouts, bounded input size, and per-user rate/usage limits.
- When an integration is unavailable, the API MUST respond with a clear, documented error
  (`503` with a problem `code`), never a crash or a hang.

Rationale: core functionality must never depend on a paid or flaky external service.

## Technology and Platform Constraints

- Language: TypeScript (strict mode) on Node.js 22 LTS or newer, ES modules.
- API: Fastify with Zod type provider; OpenAPI via `@fastify/swagger`.
- Data: PostgreSQL 16+ accessed through Drizzle ORM; migrations via drizzle-kit.
- Frontend: React + Vite + TypeScript, consuming only the public API.
- Testing: Vitest for unit and integration tests; Supertest-style injection via Fastify `inject`.
- Packaging: npm workspaces monorepo (`apps/api`, `apps/web`); the API ships as a Docker image.
- Hosting target: Render (API + static site) with Neon PostgreSQL; nothing may assume a
  persistent local filesystem.

## Development Workflow and Quality Gates

- Work follows Spec Kit: specify → plan → tasks → implement. Specs live in `specs/`.
- Every change passes `npm run lint`, `npm run typecheck`, and `npm test` locally and in GitHub
  Actions before merging to `main`.
- Commits are small and descriptive (Conventional Commits style: `feat:`, `fix:`, `docs:` ...).
- The README MUST stay accurate: setup, environment variables, architecture, and how to run
  tests.

## Governance

This constitution supersedes ad-hoc preferences. Plans produced by `/speckit-plan` MUST include a
Constitution Check, and any deviation MUST be recorded with its justification in the plan's
Complexity Tracking table.

Amendments are made by editing this file through `/speckit-constitution`, with the version bumped
by semantic versioning: MAJOR for removing or redefining a principle, MINOR for adding a principle
or materially expanding guidance, PATCH for clarifications.

**Version**: 1.0.0 | **Ratified**: 2026-11-05 | **Last Amended**: 2026-11-05
