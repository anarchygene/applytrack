import { describe, expect, it } from 'vitest';
import { runDemoCleanup } from '../../src/jobs/demo-cleanup.js';
import { call, registerUser, useTestApp, type TestUser } from '../helpers/app.js';

describe('demo accounts', () => {
  const ctx = useTestApp();

  async function startDemo() {
    const res = await call(ctx.app, null, 'POST', '/v1/auth/demo');
    expect(res.status).toBe(201);
    return {
      body: res.body,
      user: { headers: { authorization: `Bearer ${res.body.token}` } } as TestUser,
    };
  }

  it('creates a private demo account pre-filled with realistic data', async () => {
    const { body, user } = await startDemo();
    expect(body.user).toMatchObject({ isDemo: true, name: 'Demo User' });

    const apps = await call(ctx.app, user, 'GET', '/v1/applications?pageSize=100');
    expect(apps.body.total).toBe(15);

    const stats = await call(ctx.app, user, 'GET', '/v1/stats');
    expect(stats.body.totals.submitted).toBeGreaterThan(5);
    expect(stats.body.responseRate).toBeGreaterThan(0);

    const reminders = await call(ctx.app, user, 'GET', '/v1/reminders');
    const total =
      reminders.body.overdue.length + reminders.body.dueToday.length + reminders.body.upcoming.length;
    expect(total).toBeGreaterThan(3);

    const resume = await call(ctx.app, user, 'GET', '/v1/me/resume');
    expect(resume.body.text).toContain('Software Engineer');

    const offer = apps.body.items.find((a: { stage: string }) => a.stage === 'offer');
    const timeline = await call(ctx.app, user, 'GET', `/v1/applications/${offer.id}/timeline`);
    expect(timeline.body.length).toBeGreaterThan(3);
  });

  it('gives each visitor a separate account that cannot be signed into by password', async () => {
    const a = await startDemo();
    const b = await startDemo();
    expect(a.body.user.id).not.toBe(b.body.user.id);

    const login = await call(ctx.app, null, 'POST', '/v1/auth/login', {
      email: a.body.user.email,
      password: '!demo-account-no-password-login',
    });
    expect(login.status).toBe(401);
  });

  it('removes demo accounts older than 24 hours and keeps everything else', async () => {
    const { user } = await startDemo();
    const regular = await registerUser(ctx.app);

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 23 * 3_600_000);
    expect(await runDemoCleanup(ctx.app)).toBe(0);

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 2 * 3_600_000);
    expect(await runDemoCleanup(ctx.app)).toBe(1);

    const { rows } = await ctx.database.pool.query(
      'SELECT (SELECT count(*) FROM applications)::int AS apps, (SELECT count(*) FROM users)::int AS users',
    );
    expect(rows[0]).toEqual({ apps: 0, users: 1 });
    expect((await call(ctx.app, user, 'GET', '/v1/me')).status).toBe(401);
    expect((await call(ctx.app, regular, 'GET', '/v1/me')).status).toBe(200);
  });
});
