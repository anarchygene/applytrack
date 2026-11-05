import { describe, expect, it } from 'vitest';
import { call, createApplication, registerUser, useTestApp } from '../helpers/app.js';

describe('reminders', () => {
  // 2026-11-05 03:00 UTC = 11:00 in Singapore, so "today" is 2026-11-05.
  const ctx = useTestApp({ now: new Date('2026-11-05T03:00:00Z') });

  const add = (user: Parameters<typeof call>[1], appId: string, title: string, dueOn: string) =>
    call(ctx.app, user, 'POST', `/v1/applications/${appId}/reminders`, { title, dueOn });

  it('groups reminders into overdue, today and upcoming', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    await add(user, app.id, 'Upcoming', '2026-11-12');
    await add(user, app.id, 'Overdue', '2026-11-04');
    await add(user, app.id, 'Today', '2026-11-05');

    const res = await call(ctx.app, user, 'GET', '/v1/reminders');
    expect(res.status).toBe(200);
    expect(res.body.today).toBe('2026-11-05');
    expect(res.body.overdue.map((r: { title: string }) => r.title)).toEqual(['Overdue']);
    expect(res.body.dueToday.map((r: { title: string }) => r.title)).toEqual(['Today']);
    expect(res.body.upcoming[0]).toMatchObject({
      title: 'Upcoming',
      isAuto: false,
      application: { company: 'Acme Corp', role: 'Backend Engineer' },
    });
  });

  it("evaluates today in the user's time zone", async () => {
    const user = await registerUser(ctx.app, { timezone: 'America/Los_Angeles' });
    const app = await createApplication(ctx.app, user);
    await add(user, app.id, 'Due 5th', '2026-11-05');
    // 03:00 UTC on the 5th is still the 4th in Los Angeles.
    const res = await call(ctx.app, user, 'GET', '/v1/reminders');
    expect(res.body.today).toBe('2026-11-04');
    expect(res.body.upcoming).toHaveLength(1);
  });

  it('completes, reopens, edits and deletes a reminder', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    const reminder = (await add(user, app.id, 'Call recruiter', '2026-11-04')).body;

    const done = await call(ctx.app, user, 'PATCH', `/v1/reminders/${reminder.id}`, {
      completed: true,
    });
    expect(done.body.completedAt).toBe('2026-11-05T03:00:00.000Z');
    const due = await call(ctx.app, user, 'GET', '/v1/reminders');
    expect(due.body.overdue).toEqual([]);
    expect(due.body.completed).toEqual([]);

    const withCompleted = await call(ctx.app, user, 'GET', '/v1/reminders?includeCompleted=true');
    expect(withCompleted.body.completed).toHaveLength(1);

    const reopened = await call(ctx.app, user, 'PATCH', `/v1/reminders/${reminder.id}`, {
      completed: false,
      title: 'Email recruiter',
      dueOn: '2026-11-20',
    });
    expect(reopened.body).toMatchObject({
      completedAt: null,
      title: 'Email recruiter',
      dueOn: '2026-11-20',
    });

    expect((await call(ctx.app, user, 'DELETE', `/v1/reminders/${reminder.id}`)).status).toBe(204);
    expect((await call(ctx.app, user, 'DELETE', `/v1/reminders/${reminder.id}`)).status).toBe(404);
  });

  it('validates reminder input', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    expect((await add(user, app.id, '', '2026-11-05')).status).toBe(400);
    expect((await add(user, app.id, 't'.repeat(201), '2026-11-05')).status).toBe(400);
    expect((await add(user, app.id, 'Bad date', '2026-02-30')).status).toBe(400);
  });

  it('filters by application', async () => {
    const user = await registerUser(ctx.app);
    const a = await createApplication(ctx.app, user);
    const b = await createApplication(ctx.app, user, { company: 'Globex' });
    await add(user, a.id, 'For A', '2026-11-10');
    await add(user, b.id, 'For B', '2026-11-10');
    const res = await call(ctx.app, user, 'GET', `/v1/reminders?applicationId=${b.id}`);
    expect(res.body.upcoming.map((r: { title: string }) => r.title)).toEqual(['For B']);
  });

  it('creates exactly one automatic follow-up 7 days after first applying', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/stage`, { stage: 'applied' });
    await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/stage`, { stage: 'rejected' });
    await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/stage`, { stage: 'applied' });

    const res = await call(ctx.app, user, 'GET', '/v1/reminders');
    const auto = res.body.upcoming.filter((r: { isAuto: boolean }) => r.isAuto);
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({ title: 'Follow up on application', dueOn: '2026-11-12' });
  });

  it('creates the follow-up when an application is created as applied', async () => {
    const user = await registerUser(ctx.app);
    await createApplication(ctx.app, user, { stage: 'applied', appliedOn: '2026-10-20' });
    const res = await call(ctx.app, user, 'GET', '/v1/reminders');
    expect(res.body.overdue).toMatchObject([{ dueOn: '2026-10-27', isAuto: true }]);
  });

  it('deletes reminders with their application', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    await add(user, app.id, 'Gone soon', '2026-11-10');
    await call(ctx.app, user, 'DELETE', `/v1/applications/${app.id}`);
    expect((await call(ctx.app, user, 'GET', '/v1/reminders')).body.upcoming).toEqual([]);
  });
});
