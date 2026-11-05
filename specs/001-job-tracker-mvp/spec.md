# Feature Specification: ApplyTrack — Job Application Tracker MVP

**Feature Branch**: `001-job-tracker-mvp`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Job application tracker: track applications through stages, set
reminders, see pipeline stats, with optional AI help tailoring your resume to a job post. Backend
API is the focus, with a light web dashboard as a client."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record and find my job applications (Priority: P1)

A job seeker creates an account, signs in, and records each job they are interested in or have
applied to: company, role title, job posting link, location, work arrangement (on-site / hybrid /
remote), salary range, where they found it, the job description, and free-form notes. They can
see all of their applications in one list, search by company or role, filter by stage, sort by
date, and page through long lists. They can edit or delete any entry. Nobody else can see their
data.

**Why this priority**: Without reliable capture and retrieval of applications there is no product.
This slice alone replaces the spreadsheet most job seekers use today.

**Independent Test**: Register two accounts; with the first, create, list, search, edit and delete
applications; confirm the second account sees none of them and cannot open them by id.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they register with an email and a password
   meeting the password rules, **Then** an account is created and they are signed in.
2. **Given** a signed-in user, **When** they submit a new application with company and role,
   **Then** it is saved with stage "Wishlist" (or the stage they chose) and appears in their list.
3. **Given** a user with 30 applications, **When** they search "acme", **Then** only applications
   whose company or role contains "acme" (case-insensitive) are returned, newest first by default.
4. **Given** user A's application id, **When** user B requests, edits or deletes it, **Then** the
   system responds as if it does not exist.
5. **Given** a signed-in user, **When** they sign out, **Then** subsequent requests with their old
   session are rejected.

---

### User Story 2 - Move applications through a hiring pipeline (Priority: P2)

The user moves each application through stages — Wishlist → Applied → Screening → Interviewing →
Offer, ending in Accepted, Rejected or Withdrawn. Every stage change is recorded with the date it
happened and an optional note, so the user can see the full timeline of an application. The
dashboard shows applications grouped by stage as a board.

**Why this priority**: The pipeline is what turns a list into a tracker; stage history is also the
raw data for statistics (Story 4).

**Independent Test**: Create an application, move it Applied → Screening → Rejected, and confirm
the timeline lists three entries in order with dates, and that a disallowed move is refused.

**Acceptance Scenarios**:

1. **Given** an application in "Applied", **When** the user moves it to "Interviewing", **Then** the
   stage changes and a timeline entry records from-stage, to-stage, date and note.
2. **Given** an application in a closed stage (Accepted, Rejected, Withdrawn), **When** the user
   tries to move it to "Screening", **Then** the change is refused with a clear reason, unless they
   explicitly reopen it to "Applied".
3. **Given** an application moved to "Applied" (or straight to a later stage such as "Screening")
   for the first time, **Then** its applied date is set to the date of that move (unless the user
   supplied one).

---

### User Story 3 - Never forget a follow-up (Priority: P3)

The user attaches reminders to an application ("Follow up with recruiter", "Prepare for technical
interview") with a due date. They see one list of reminders that are overdue, due today, and
upcoming, and can mark reminders done. When an application first moves to "Applied", the system
automatically creates a follow-up reminder 7 days later, which the user can edit or delete.

**Why this priority**: Missed follow-ups are a leading cause of lost opportunities, but the
tracker is still useful without reminders.

**Independent Test**: Create a reminder due yesterday and one due next week; the due list shows the
first as overdue and the second as upcoming; marking the first done removes it from the due list.

**Acceptance Scenarios**:

1. **Given** an application, **When** the user adds a reminder with a title and due date, **Then**
   it appears in the reminders list linked to that application.
2. **Given** reminders with past, current and future due dates, **When** the user views due
   reminders, **Then** they are grouped as overdue / today / upcoming, ordered by due date.
3. **Given** an application moved to "Applied", **Then** a follow-up reminder due 7 days later
   exists; moving it to "Applied" again later does not create a duplicate.

---

### User Story 4 - Understand how my search is going (Priority: P4)

The user sees a summary of their job search: how many applications are in each stage, how many
they submitted per week over the last 12 weeks, their response rate (share of submitted
applications that progressed past "Applied"), their average days from applying to first
response, and their offer rate.

**Why this priority**: Insight motivates and guides the user (e.g. "my response rate from job
boards is low"), but it depends on data from Stories 1–2.

**Independent Test**: Seed a known set of applications and stage histories; the statistics match
hand-calculated values exactly.

**Acceptance Scenarios**:

1. **Given** 10 submitted applications of which 3 reached Screening or later, **When** the user
   views stats, **Then** the response rate shows 30%.
2. **Given** a user with no applications, **When** they view stats, **Then** all counts are zero and
   rates are shown as "not enough data" rather than errors or divide-by-zero values.
3. **Given** applications from several sources, **Then** the stats include response rate per
   source.

---

### User Story 5 - Tailor my resume to a job post with AI (Priority: P5, optional)

The user saves their base resume (plain text) once. For any application that has a job
description, they request AI suggestions: rewritten resume bullet points emphasising relevant
experience, a list of keywords from the posting that are missing from the resume, and a short
match summary. Suggestions are stored with the application so they can revisit them. The feature
is only available when the operator has configured an AI provider; otherwise the dashboard hides
it and the API reports it as unavailable.

**Why this priority**: A differentiating extra, but core tracking must never depend on it.

**Independent Test**: With the AI provider replaced by a predictable fake, request suggestions and
confirm they are stored and returned; with no provider configured, confirm a clear "unavailable"
response and that every other feature still works.

**Acceptance Scenarios**:

1. **Given** a saved resume and an application with a job description, **When** the user requests
   tailoring, **Then** suggestions (bullets, missing keywords, summary) are returned and saved.
2. **Given** a user who has reached the daily tailoring limit, **When** they request again,
   **Then** the request is refused with the time at which they can try again.
3. **Given** no AI provider configured, **When** a user requests tailoring, **Then** they receive an
   "AI features unavailable" response and no other functionality is affected.
4. **Given** no saved resume or an empty job description, **When** they request tailoring, **Then**
   the request is refused explaining what is missing.

---

### Edge Cases

- Registering with an email that already exists (in any letter case) is refused without revealing
  more than necessary.
- Repeated failed sign-in attempts from the same source are throttled.
- Very long text fields (job descriptions, notes, resume) beyond documented limits are refused
  with a validation message rather than truncated silently.
- Deleting an application also deletes its timeline, reminders and AI suggestions.
- Deleting an account permanently removes all of that user's data.
- Salary minimum greater than maximum is refused.
- A posting link that is not a valid http(s) URL is refused.
- Requesting a page beyond the last page returns an empty page, not an error.
- The AI provider timing out or erroring returns a clear temporary-failure response and does not
  count against the user's daily limit.
- Reminder due dates are calendar dates; "today" is evaluated in the user's time zone setting.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts and access**

- **FR-001**: System MUST allow a visitor to register with an email address, a display name, and a
  password of at least 10 characters.
- **FR-002**: System MUST treat email addresses case-insensitively and allow one account per email.
- **FR-003**: System MUST let a registered user sign in and sign out; signed-in sessions expire
  after 7 days of inactivity.
- **FR-004**: System MUST throttle repeated sign-in and registration attempts (max 10 per minute per
  client).
- **FR-005**: System MUST ensure a user can only read, change or delete their own data; requests
  for other users' records behave as if the record does not exist.
- **FR-006**: Users MUST be able to permanently delete their account and all associated data.
- **FR-007**: Users MUST be able to set their time zone (default: Asia/Singapore).

**Applications**

- **FR-010**: Users MUST be able to create an application with company (required), role title
  (required), posting URL, location, work arrangement, salary range with currency, source, job
  description, notes, and initial stage.
- **FR-011**: Users MUST be able to view, update and delete their applications.
- **FR-012**: Users MUST be able to list applications with: text search over company and role;
  filters by stage, work arrangement and source; sorting by created date, updated date, applied
  date or company; and pagination (default 20, max 100 per page) with a total count.
- **FR-013**: System MUST validate all fields and reject invalid input with field-level messages.

**Pipeline**

- **FR-020**: System MUST support stages Wishlist, Applied, Screening, Interviewing, Offer,
  Accepted, Rejected, Withdrawn.
- **FR-021**: System MUST record every stage change (from, to, timestamp, optional note) and expose
  it as the application's timeline.
- **FR-022**: System MUST refuse moves out of a closed stage (Accepted, Rejected, Withdrawn) except
  reopening to Applied.
- **FR-023**: System MUST set the applied date the first time an application reaches Applied or
  any later submitted stage (Screening, Interviewing, Offer, Accepted, Rejected) when none is set.

**Reminders**

- **FR-030**: Users MUST be able to create, edit, complete, reopen and delete reminders, each linked
  to one of their applications, with a title and due date.
- **FR-031**: Users MUST be able to list reminders grouped as overdue, due today, and upcoming,
  optionally including completed ones.
- **FR-032**: System MUST create a follow-up reminder 7 days after an application's first move to
  Applied, at most once per application.

**Statistics**

- **FR-040**: System MUST report count of applications per stage.
- **FR-041**: System MUST report applications submitted per ISO week for the last 12 weeks.
- **FR-042**: System MUST report response rate, offer rate, and average days from applied to first
  response, overall and per source, returning "not enough data" when there are no submitted
  applications.

**AI tailoring (optional)**

- **FR-050**: Users MUST be able to save and update one base resume (plain text, max 20,000
  characters).
- **FR-051**: When an AI provider is configured, users MUST be able to request tailoring for an
  application with a job description, receiving rewritten bullets, missing keywords and a match
  summary, which are stored and listed per application.
- **FR-052**: System MUST limit tailoring requests to 10 successful requests per user per day.
- **FR-053**: System MUST report whether AI features are available so clients can hide them.
- **FR-054**: When no provider is configured or the provider fails, the system MUST return a clear
  "unavailable" or "temporary failure" response without affecting other features.

**Platform**

- **FR-060**: System MUST publish interactive, always-current API documentation.
- **FR-061**: System MUST return errors in one consistent, documented format with a stable code.
- **FR-062**: System MUST expose health and readiness checks for the hosting platform.
- **FR-063**: The web dashboard MUST provide sign-up/sign-in, an application list with search and
  filters, a stage board, an application detail page with timeline and reminders, a reminders
  page, a stats page, and (when available) AI tailoring.
- **FR-064**: Visitors MUST be able to start a private, temporary demo account pre-filled with
  realistic sample data in one click; demo accounts and their data MUST be removed automatically
  after 24 hours.

### Key Entities

- **User**: An account holder. Email (unique, case-insensitive), display name, password secret,
  time zone, base resume text, whether it is a temporary demo account, created date.
- **Session**: A signed-in session belonging to a user, with expiry; revoked on sign-out.
- **Application**: A job opportunity owned by one user. Company, role, posting URL, location, work
  arrangement, salary min/max/currency, source, job description, notes, current stage, applied
  date, created/updated dates.
- **Stage Event**: One entry in an application's timeline: from-stage, to-stage, note, timestamp.
- **Reminder**: A dated to-do linked to one application: title, due date, completed date, and
  whether it was auto-created.
- **Tailoring Suggestion**: AI output for one application: bullets, missing keywords, summary,
  model used, created date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can register and record their first application in under 2 minutes.
- **SC-002**: A user with 500 applications can search, filter and page through them with results
  appearing in under 1 second.
- **SC-003**: In automated tests, 100% of attempts to read or change another user's data are
  refused.
- **SC-004**: Statistics match hand-calculated values exactly for the seeded reference dataset.
- **SC-005**: With AI disabled, 100% of non-AI acceptance scenarios still pass.
- **SC-006**: Every API endpoint appears in the published API documentation with request and
  response shapes.
- **SC-007**: The service is deployed at a public URL and a reviewer can try it end-to-end with a
  demo account in under 5 minutes.

## Assumptions

- Single-user accounts only; no teams, sharing, or recruiter-facing features in the MVP.
- Email/password sign-in only; social login, email verification and password reset are out of
  scope for the MVP (documented as future work).
- Reminders are shown in-app only; email or push notifications are out of scope for the MVP.
- Resume input is plain text; uploading and parsing PDF/Word files is out of scope.
- Data import (e.g. CSV, LinkedIn) is out of scope.
- The AI provider is Anthropic's Claude API, configured by the operator with their own key; users
  never supply keys.
- Default currency is SGD and default time zone Asia/Singapore, matching the author's market, but
  both are user-selectable.
- Desktop browsers are the primary target for the dashboard; it must remain usable on mobile
  widths but is not a native app.
