import { describe, expect, it } from 'vitest';
import { FakeTailoringProvider } from '../../src/modules/tailoring/provider.js';
import { call, createApplication, registerUser, useTestApp, type TestUser } from '../helpers/app.js';

describe('AI tailoring (enabled)', () => {
  const provider = new FakeTailoringProvider();
  const ctx = useTestApp({ tailoring: provider });

  async function ready(): Promise<{ user: TestUser; appId: string }> {
    const user = await registerUser(ctx.app);
    await call(ctx.app, user, 'PUT', '/v1/me/resume', { text: 'Built APIs in TypeScript' });
    const app = await createApplication(ctx.app, user, { jobDescription: 'Need Node.js and SQL' });
    return { user, appId: app.id };
  }

  it('reports availability and usage', async () => {
    const user = await registerUser(ctx.app);
    const res = await call(ctx.app, user, 'GET', '/v1/ai/status');
    expect(res.body).toEqual({
      available: true,
      reason: null,
      model: 'fake-model',
      dailyLimit: 10,
      usedToday: 0,
    });
  });

  it('generates, stores and lists suggestions', async () => {
    const { user, appId } = await ready();
    const created = await call(ctx.app, user, 'POST', `/v1/applications/${appId}/tailorings`);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      applicationId: appId,
      bullets: [expect.stringContaining('Backend Engineer')],
      missingKeywords: ['Kubernetes'],
      model: 'fake-model',
    });
    expect(provider.calls.at(-1)).toMatchObject({
      resume: 'Built APIs in TypeScript',
      jobDescription: 'Need Node.js and SQL',
      company: 'Acme Corp',
    });

    const list = await call(ctx.app, user, 'GET', `/v1/applications/${appId}/tailorings`);
    expect(list.body).toHaveLength(1);
  });

  it('requires a saved resume and a job description', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user, { jobDescription: 'JD' });
    const noResume = await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/tailorings`);
    expect(noResume.status).toBe(422);
    expect(noResume.body.code).toBe('precondition_failed');

    await call(ctx.app, user, 'PUT', '/v1/me/resume', { text: 'Resume' });
    const noJd = await createApplication(ctx.app, user);
    const res = await call(ctx.app, user, 'POST', `/v1/applications/${noJd.id}/tailorings`);
    expect(res.status).toBe(422);
    expect(res.body.detail).toContain('job description');
  });

  it('enforces the rolling daily limit with Retry-After', async () => {
    const { user, appId } = await ready();
    for (let i = 0; i < 10; i++) {
      expect((await call(ctx.app, user, 'POST', `/v1/applications/${appId}/tailorings`)).status).toBe(201);
    }
    const limited = await call(ctx.app, user, 'POST', `/v1/applications/${appId}/tailorings`);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('ai_daily_limit');
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(86_000);
    expect(retryAfter).toBeLessThanOrEqual(86_500);

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 86_400_000 + 60_000);
    expect((await call(ctx.app, user, 'POST', `/v1/applications/${appId}/tailorings`)).status).toBe(201);
  });

  it('does not count provider failures against the limit', async () => {
    const { user, appId } = await ready();
    provider.failNext = true;
    const failed = await call(ctx.app, user, 'POST', `/v1/applications/${appId}/tailorings`);
    expect(failed.status).toBe(502);
    expect(failed.body.code).toBe('ai_provider_error');
    expect((await call(ctx.app, user, 'GET', '/v1/ai/status')).body.usedToday).toBe(0);
  });

  it('is unavailable to demo accounts by default', async () => {
    const demo = await call(ctx.app, null, 'POST', '/v1/auth/demo');
    const demoUser = { headers: { authorization: `Bearer ${demo.body.token}` } } as TestUser;
    const status = await call(ctx.app, demoUser, 'GET', '/v1/ai/status');
    expect(status.body.available).toBe(false);
    expect(status.body.reason).toContain('demo');

    const apps = await call(ctx.app, demoUser, 'GET', '/v1/applications?q=Durian');
    const res = await call(ctx.app, demoUser, 'POST', `/v1/applications/${apps.body.items[0].id}/tailorings`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ai_unavailable');
  });
});

describe('AI tailoring (not configured)', () => {
  const ctx = useTestApp({ tailoring: null });

  it('reports unavailable and refuses requests without affecting other features', async () => {
    const user = await registerUser(ctx.app);
    const status = await call(ctx.app, user, 'GET', '/v1/ai/status');
    expect(status.body).toMatchObject({ available: false, model: null });

    const app = await createApplication(ctx.app, user, { jobDescription: 'JD' });
    const res = await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/tailorings`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('ai_unavailable');

    expect((await call(ctx.app, user, 'GET', '/v1/stats')).status).toBe(200);
  });
});
