# Data Model: ApplyTrack MVP

PostgreSQL 17. All ids are UUID v4 (`gen_random_uuid()`), all instants are `timestamptz` (UTC),
calendar dates are `date`. Every user-owned table cascades on user deletion.

## Enums

| Enum | Values |
|------|--------|
| `stage` | `wishlist`, `applied`, `screening`, `interviewing`, `offer`, `accepted`, `rejected`, `withdrawn` |
| `work_mode` | `onsite`, `hybrid`, `remote` |
| `source` | `linkedin`, `company_site`, `job_board`, `referral`, `recruiter`, `career_fair`, `other` |

## users

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| email | text, unique | stored lower-cased and trimmed; valid email; ≤ 254 chars |
| name | text | 1–100 chars |
| password_hash | text | argon2id encoded string; never returned |
| timezone | text | IANA zone, validated with `Intl`; default `Asia/Singapore` |
| resume_text | text null | ≤ 20,000 chars |
| is_demo | boolean | default false |
| created_at / updated_at | timestamptz | |

Index: `users_demo_created_idx (created_at) WHERE is_demo` for the cleanup job.

## sessions

| Column | Type | Rules |
|--------|------|-------|
| id | text PK | hex SHA-256 of the opaque token |
| user_id | uuid FK → users ON DELETE CASCADE | |
| created_at | timestamptz | |
| expires_at | timestamptz | now + 7 days; slid forward at most hourly |

Index: `sessions_user_idx (user_id)`.

## applications

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | every query filters on it |
| company | text | 1–200 chars, required |
| role | text | 1–200 chars, required |
| posting_url | text null | http(s) URL, ≤ 2,048 chars |
| location | text null | ≤ 200 chars |
| work_mode | work_mode null | |
| salary_min / salary_max | integer null | ≥ 0; min ≤ max when both present |
| salary_currency | char(3) | ISO 4217 upper-case; default `SGD` |
| source | source null | |
| job_description | text null | ≤ 20,000 chars |
| notes | text null | ≤ 10,000 chars |
| stage | stage | default `wishlist` |
| applied_on | date null | set on first move to `applied` (FR-023) |
| created_at / updated_at | timestamptz | |

Indexes: `(user_id, created_at DESC)`, `(user_id, stage)`.
Check constraint: `salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max`.

## stage_events

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| application_id | uuid FK → applications ON DELETE CASCADE | |
| from_stage | stage null | null for the creation event |
| to_stage | stage | |
| note | text null | ≤ 1,000 chars |
| occurred_at | timestamptz | defaults to now; may be back-dated, not in the future |

Index: `(application_id, occurred_at)`.

## reminders

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | |
| application_id | uuid FK → applications ON DELETE CASCADE | must belong to the same user |
| title | text | 1–200 chars |
| due_on | date | |
| completed_at | timestamptz null | |
| is_auto | boolean | true for the automatic follow-up |
| created_at / updated_at | timestamptz | |

Index: `(user_id, completed_at, due_on)`.

## tailorings

| Column | Type | Rules |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK → users ON DELETE CASCADE | |
| application_id | uuid FK → applications ON DELETE CASCADE | |
| bullets | jsonb | string[] (3–8 items, each ≤ 400 chars) |
| missing_keywords | jsonb | string[] (≤ 30 items) |
| summary | text | ≤ 1,500 chars |
| model | text | model id used |
| created_at | timestamptz | |

Index: `(user_id, created_at)` for the rolling daily limit.

## State transitions (stage)

```text
            ┌──────────────────────── open stages ───────────────────────┐
 wishlist → applied → screening → interviewing → offer → accepted
    │          │          │            │           │
    └──────────┴──────────┴────────────┴───────────┴──→ rejected | withdrawn

 Open stage   → any other stage (forward, backward or closing) is allowed.
 Closed stage (accepted, rejected, withdrawn) → only `applied` (reopen).
 Moving to the current stage is refused (409 stage_unchanged).
```

Side effects of a stage change, in one transaction:

1. Insert a `stage_events` row.
2. If `to_stage = applied` and `applied_on IS NULL`: set `applied_on` to the event date in the
   user's time zone, and insert an auto reminder "Follow up on application" due `applied_on + 7`.
3. Update `applications.stage` and `updated_at`.

Creating an application inserts a creation event (`from_stage = null`). If it is created directly in
a stage past `wishlist`, the same `applied_on`/auto-reminder rule applies, using the supplied
`appliedOn` if given.

## Statistics definitions (FR-040 – FR-042)

- **Submitted**: applications with `applied_on IS NOT NULL`.
- **Responded**: submitted applications having any stage event with `to_stage` in
  (`screening`, `interviewing`, `offer`, `accepted`).
- **First response date**: earliest such event's `occurred_at`, as a date in the user's zone.
- **Response rate** = responded / submitted. **Offer rate** = submitted applications that reached
  `offer` or `accepted` / submitted. Both `null` ("not enough data") when submitted = 0.
- **Average days to first response** = mean(first response date − `applied_on`) over responded
  applications; `null` when none.
- **Weekly submissions**: count by ISO week (Monday start) of `applied_on` for the 12 weeks ending
  with the current week in the user's zone, zero-filled.
- **By source**: the same submitted/responded/rates grouped by `source` (null grouped as
  `unknown`).

## Reminder grouping (FR-031)

With `today` = current date in the user's time zone, for incomplete reminders: `due_on < today` →
overdue; `= today` → today; `> today` → upcoming. Each group is ordered by `due_on`, then
`created_at`.
