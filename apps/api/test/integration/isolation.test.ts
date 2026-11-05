import { describe, expect, it } from 'vitest';
import { FakeTailoringProvider } from '../../src/modules/tailoring/provider.js';
import { call, createApplication, registerUser, useTestApp } from '../helpers/app.js';

/** SC-003: every attempt to read or change another user's data is refused as "not found". */
describe('per-user data isolation', () => {
  const ctx = useTestApp({ tailoring: new FakeTailoringProvider() });

  it('hides every resource of user A from user B', async () => {
    const alice = await registerUser(ctx.app);
    const bob = await registerUser(ctx.app);

    await call(ctx.app, alice, 'PUT', '/v1/me/resume', { text: 'Alice resume' });
    const app = await createApplication(ctx.app, alice, { jobDescription: 'Job' });
    const reminder = (
      await call(ctx.app, alice, 'POST', `/v1/applications/${app.id}/reminders`, {
        title: 'Alice reminder',
        dueOn: '2030-01-01',
      })
    ).body;
    expect(
      (await call(ctx.app, alice, 'POST', `/v1/applications/${app.id}/tailorings`)).status,
    ).toBe(201);

    const attempts: [string, string, unknown?][] = [
      ['GET', `/v1/applications/${app.id}`],
      ['PATCH', `/v1/applications/${app.id}`, { notes: 'hacked' }],
      ['DELETE', `/v1/applications/${app.id}`],
      ['POST', `/v1/applications/${app.id}/stage`, { stage: 'offer' }],
      ['GET', `/v1/applications/${app.id}/timeline`],
      ['POST', `/v1/applications/${app.id}/reminders`, { title: 'x', dueOn: '2030-01-01' }],
      ['PATCH', `/v1/reminders/${reminder.id}`, { completed: true }],
      ['DELETE', `/v1/reminders/${reminder.id}`],
      ['GET', `/v1/applications/${app.id}/tailorings`],
      ['POST', `/v1/applications/${app.id}/tailorings`],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await call(ctx.app, bob, method as 'GET', url, payload);
      expect(res.status, `${method} ${url}`).toBe(404);
      expect(res.body.code).toBe('not_found');
    }

    const bobList = await call(ctx.app, bob, 'GET', '/v1/applications');
    expect(bobList.body.total).toBe(0);
    const bobReminders = await call(ctx.app, bob, 'GET', `/v1/reminders?applicationId=${app.id}`);
    expect(bobReminders.body.upcoming).toEqual([]);
    const bobStats = await call(ctx.app, bob, 'GET', '/v1/stats');
    expect(bobStats.body.totals.all).toBe(0);

    // Alice's data is untouched.
    const after = await call(ctx.app, alice, 'GET', `/v1/applications/${app.id}`);
    expect(after.body).toMatchObject({ stage: 'wishlist', notes: null });
    const aliceReminders = await call(ctx.app, alice, 'GET', '/v1/reminders');
    expect(aliceReminders.body.upcoming).toHaveLength(1);
  });
});
