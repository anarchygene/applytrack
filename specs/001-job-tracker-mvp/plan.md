# Implementation Plan: ApplyTrack — Job Application Tracker MVP

**Branch**: `001-job-tracker-mvp` | **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-job-tracker-mvp/spec.md`

## Summary

A contract-first REST API for tracking job applications through a hiring pipeline, with stage
history, reminders (including automatic follow-ups), SQL-computed search statistics, and optional
Claude-powered resume tailoring. Fastify + Zod generate validation, types and OpenAPI docs from one
schema per route; Drizzle + PostgreSQL store the data; server-side hashed sessions handle auth. A
light React dashboard consumes a client generated from the OpenAPI document and is served by the
API from one Docker image on Render, backed by Neon PostgreSQL.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict, ESM) on Node.js 24 LTS (engines `>=22.12`)

**Primary Dependencies**: Fastify 5, fastify-type-provider-zod 7, Zod 4, @fastify/swagger +
Scalar, Drizzle ORM 0.45 + drizzle-kit, pg 8, @node-rs/argon2, @fastify/cookie,
@fastify/rate-limit, @fastify/helmet, @fastify/static, @anthropic-ai/sdk; web: React 19, Vite 8,
React Router, TanStack Query, Tailwind CSS 4, openapi-typescript + openapi-fetch

**Storage**: PostgreSQL 17 (Docker Compose locally, `postgres:17` service in CI, Neon in production)

**Testing**: Vitest 5 — unit tests for domain logic; integration tests via `app.inject()` against a
real PostgreSQL test database; fake AI provider

**Target Platform**: Linux container (Render web service); evergreen desktop and mobile browsers

**Project Type**: Web service with SPA client (npm workspaces monorepo)

**Performance Goals**: p95 < 200 ms for list/search/stats with 500 applications per user;
dashboard interactive in < 2 s on broadband

**Constraints**: Free-tier hosting (512 MB RAM, cold starts); no persistent local disk; AI cost
bounded by per-user daily limit and input caps

**Scale/Scope**: Portfolio demo — hundreds of users, ≤ 5,000 applications per user; ~25 endpoints,
~7 screens

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the design complies | Status |
|-----------|-------------------------|--------|
| I. API-First, Contract-Driven | Zod schema per route → validation + types + OpenAPI at `/docs`; RFC 9457 errors with stable codes; `/v1` prefix; web client generated from committed `openapi.json` with CI drift check | ✅ |
| II. Test-First Discipline | Every user story has HTTP-level integration tests on real Postgres; domain logic unit-tested; AI faked; CI gates `main` | ✅ |
| III. Secure by Default | argon2id; hashed opaque session tokens; repository functions take `userId` and always filter on it; strict Zod (unknown keys rejected); rate limits on auth, demo, AI; secrets only from env; pino redaction | ✅ |
| IV. Layered Simplicity | `routes → services → repositories`; single API process; in-process cleanup interval instead of a job queue; in-memory rate-limit store | ✅ |
| V. Observable and Operable | pino JSON logs with request ids; `/health` + `/ready`; Zod-validated env config; graceful shutdown; drizzle-kit migrations run as Render pre-deploy | ✅ |
| VI. Optional Integrations Degrade Gracefully | AI behind `TailoringProvider`; absent key → `503 ai_unavailable`; timeouts, input caps, 10/day limit; core features unaffected | ✅ |
| Platform constraints | TS strict, Node ≥ 22, Fastify, Drizzle, React + Vite, Vitest, npm workspaces, Docker on Render + Neon | ✅ |

**Post-design re-check (after Phase 1)**: ✅ No violations. Serving the SPA from the API process
is consistent with "Render (API + static site)" — it is one service hosting both — and is justified
in research R7 by cookie security.

## Project Structure

### Documentation (this feature)

```text
specs/001-job-tracker-mvp/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: tables, enums, transitions, stats definitions
├── quickstart.md        # Phase 1: setup and validation guide
├── contracts/
│   └── http-api.md      # Phase 1: human-readable API contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── drizzle/                 # generated SQL migrations (committed)
│   ├── openapi.json             # generated contract (committed, drift-checked in CI)
│   ├── scripts/                 # migrate.ts, export-openapi.ts
│   ├── src/
│   │   ├── app.ts               # buildApp(): plugins, error handler, route registration
│   │   ├── server.ts            # entrypoint: config, listen, graceful shutdown
│   │   ├── config.ts            # Zod-validated environment
│   │   ├── db/                  # schema.ts, client.ts
│   │   ├── domain/              # pure logic: stages.ts, reminders.ts, dates.ts
│   │   ├── lib/                 # errors.ts (problem+json), auth plugin, schemas shared
│   │   ├── modules/
│   │   │   ├── auth/            # routes, service, repository, demo seed
│   │   │   ├── applications/    # routes, service, repository (incl. stage changes)
│   │   │   ├── reminders/
│   │   │   ├── stats/
│   │   │   └── tailoring/       # routes, service, provider.ts (Claude + fake)
│   │   └── jobs/                # demo-cleanup.ts
│   └── test/
│       ├── helpers/             # buildTestApp, resetDb, factories
│       ├── unit/
│       └── integration/
└── web/
    ├── src/
    │   ├── api/                 # generated schema.d.ts + typed client
    │   ├── components/
    │   ├── pages/               # Login, Register, Applications, Board, Detail, Reminders, Stats
    │   └── main.tsx
    └── index.html
.github/workflows/ci.yml
docker-compose.yml               # local Postgres (dev + test databases)
Dockerfile                       # multi-stage: build web + api → slim runtime
render.yaml                      # Render blueprint
```

**Structure Decision**: Web application as an npm-workspaces monorepo with `apps/api` (backend,
the focus) and `apps/web` (thin client). Feature modules inside the API keep each user story's
routes, service and repository together, which maps cleanly onto the task phases.

## Complexity Tracking

No constitution violations; table intentionally empty.
