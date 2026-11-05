# Quickstart & Validation: ApplyTrack MVP

## Prerequisites

- Node.js ≥ 22.12 (24 LTS recommended) and npm
- Docker (for the local PostgreSQL) — or any PostgreSQL 16+ you can point `DATABASE_URL` at

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env      # adjust if not using docker compose
docker compose up -d db                     # Postgres on localhost:5433 (dev + test databases)
npm run db:migrate                          # apply migrations to the dev database
npm run dev                                 # API on :3000, web on :5173 (proxied to the API)
```

Optional: set `ANTHROPIC_API_KEY` in `apps/api/.env` to enable AI tailoring.

## Automated validation

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all suites pass; integration tests run against the `applytrack_test` database.

| Spec item | Validated by |
|-----------|--------------|
| US1, FR-001–013, SC-003 | `apps/api/test/integration/auth.test.ts`, `applications.test.ts`, `isolation.test.ts` |
| US2, FR-020–023 | `apps/api/test/unit/stages.test.ts`, `integration/pipeline.test.ts` |
| US3, FR-030–032 | `apps/api/test/unit/reminders.test.ts`, `integration/reminders.test.ts` |
| US4, FR-040–042, SC-004 | `apps/api/test/integration/stats.test.ts` (reference dataset) |
| US5, FR-050–054, SC-005 | `apps/api/test/integration/tailoring.test.ts` (fake provider, enabled and disabled) |
| FR-060, SC-006 | `apps/api/test/integration/openapi.test.ts`, CI drift check |
| FR-062 | `apps/api/test/integration/platform.test.ts` |
| FR-064 | `apps/api/test/integration/demo.test.ts` |

## Manual end-to-end check

1. Open http://localhost:5173 → **Try the demo** → the dashboard shows ~15 sample applications.
2. Board view: move a Wishlist card to Applied → a follow-up reminder due in 7 days appears on the
   Reminders page.
3. Stats page shows per-stage counts, weekly chart and response rate.
4. Open http://localhost:3000/docs → every endpoint is listed; "Try it" on `GET /v1/me` works with
   the browser session.
5. Sign out → refreshing any page returns to sign-in.

## Production smoke test (after deploy)

```bash
curl -fsS https://<service>.onrender.com/health
curl -fsS https://<service>.onrender.com/ready
```

Then repeat manual steps 1–4 against the public URL.
