import { describe, expect, it } from 'vitest';
import { call, createApplication, registerUser, useTestApp } from '../helpers/app.js';

describe('applications CRUD', () => {
  const ctx = useTestApp();

  it('creates an application with defaults', async () => {
    const user = await registerUser(ctx.app);
    const res = await call(ctx.app, user, 'POST', '/v1/applications', {
      company: '  Acme  ',
      role: 'Backend Engineer',
      postingUrl: 'https://acme.example/jobs/1',
      workMode: 'remote',
      salaryMin: 5000,
      salaryMax: 7000,
      salaryCurrency: 'usd',
      source: 'linkedin',
      jobDescription: 'Build APIs',
      notes: '',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      company: 'Acme',
      stage: 'wishlist',
      appliedOn: null,
      salaryCurrency: 'USD',
      notes: null,
      jobDescription: 'Build APIs',
    });
  });

  it.each([
    [{ company: '', role: 'x' }, 'body.company'],
    [{ company: 'x'.repeat(201), role: 'x' }, 'body.company'],
    [{ company: 'x' }, 'body.role'],
    [{ company: 'x', role: 'y', postingUrl: 'ftp://files.example' }, 'body.postingUrl'],
    [{ company: 'x', role: 'y', salaryMin: 10, salaryMax: 5 }, 'body.salaryMin'],
    [{ company: 'x', role: 'y', salaryCurrency: 'XYZ' }, 'body.salaryCurrency'],
    [{ company: 'x', role: 'y', stage: 'hired' }, 'body.stage'],
    [{ company: 'x', role: 'y', notes: 'n'.repeat(10_001) }, 'body.notes'],
  ])('rejects invalid input %j', async (payload, path) => {
    const user = await registerUser(ctx.app);
    const res = await call(ctx.app, user, 'POST', '/v1/applications', payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('rejects unknown fields', async () => {
    const user = await registerUser(ctx.app);
    const res = await call(ctx.app, user, 'POST', '/v1/applications', {
      company: 'x',
      role: 'y',
      userId: 'someone-else',
    });
    expect(res.status).toBe(400);
  });

  it('gets, updates and deletes an application', async () => {
    const user = await registerUser(ctx.app);
    const created = await createApplication(ctx.app, user, { salaryMax: 8000 });

    const got = await call(ctx.app, user, 'GET', `/v1/applications/${created.id}`);
    expect(got.status).toBe(200);
    expect(got.body.company).toBe('Acme Corp');

    const patched = await call(ctx.app, user, 'PATCH', `/v1/applications/${created.id}`, {
      notes: 'Spoke to recruiter',
      location: 'Singapore',
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ notes: 'Spoke to recruiter', location: 'Singapore' });

    const badRange = await call(ctx.app, user, 'PATCH', `/v1/applications/${created.id}`, {
      salaryMin: 9000,
    });
    expect(badRange.status).toBe(400);

    const stageViaPatch = await call(ctx.app, user, 'PATCH', `/v1/applications/${created.id}`, {
      stage: 'offer',
    });
    expect(stageViaPatch.status).toBe(400);

    expect((await call(ctx.app, user, 'DELETE', `/v1/applications/${created.id}`)).status).toBe(204);
    expect((await call(ctx.app, user, 'GET', `/v1/applications/${created.id}`)).status).toBe(404);
  });

  it('returns 400 for malformed ids and 404 for unknown ids', async () => {
    const user = await registerUser(ctx.app);
    expect((await call(ctx.app, user, 'GET', '/v1/applications/not-a-uuid')).status).toBe(400);
    const missing = await call(
      ctx.app,
      user,
      'GET',
      '/v1/applications/00000000-0000-4000-8000-000000000000',
    );
    expect(missing.status).toBe(404);
  });
});

describe('applications listing', () => {
  const ctx = useTestApp();

  async function seed() {
    const user = await registerUser(ctx.app);
    const specs = [
      { company: 'Acme', role: 'Backend Engineer', stage: 'applied', source: 'linkedin', workMode: 'remote' },
      { company: 'Globex', role: 'Frontend Engineer', stage: 'wishlist', source: 'referral', workMode: 'onsite' },
      { company: 'Initech', role: 'ACME integrations dev', stage: 'screening', source: 'linkedin', workMode: 'hybrid' },
      { company: 'Umbrella', role: 'Data Engineer', stage: 'rejected', source: 'job_board', workMode: 'remote' },
      { company: 'Hooli_100%', role: 'SRE', stage: 'applied', source: 'job_board', workMode: 'onsite' },
    ];
    for (const [i, spec] of specs.entries()) {
      ctx.clock.now = new Date(Date.UTC(2026, 10, 1 + i, 2));
      await createApplication(ctx.app, user, spec);
    }
    return user;
  }

  const list = async (user: Awaited<ReturnType<typeof seed>>, qs: string) =>
    (await call(ctx.app, user, 'GET', `/v1/applications${qs}`)).body;

  it('lists newest first with pagination metadata', async () => {
    const user = await seed();
    const page = await list(user, '');
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 5 });
    expect(page.items.map((a: { company: string }) => a.company)).toEqual([
      'Hooli_100%',
      'Umbrella',
      'Initech',
      'Globex',
      'Acme',
    ]);
    expect(page.items[0]).not.toHaveProperty('jobDescription');
  });

  it('searches company and role case-insensitively, treating wildcards literally', async () => {
    const user = await seed();
    const acme = await list(user, '?q=acme');
    expect(acme.items.map((a: { company: string }) => a.company).sort()).toEqual(['Acme', 'Initech']);
    expect((await list(user, '?q=_100%25')).total).toBe(1);
    expect((await list(user, '?q=%25')).total).toBe(1);
  });

  it('filters by stage (repeatable), work mode and source', async () => {
    const user = await seed();
    expect((await list(user, '?stage=applied')).total).toBe(2);
    expect((await list(user, '?stage=applied&stage=screening')).total).toBe(3);
    expect((await list(user, '?workMode=remote')).total).toBe(2);
    expect((await list(user, '?source=linkedin&stage=screening')).total).toBe(1);
  });

  it('sorts and paginates', async () => {
    const user = await seed();
    const byCompany = await list(user, '?sort=company&order=asc&pageSize=2&page=2');
    expect(byCompany).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(byCompany.items.map((a: { company: string }) => a.company)).toEqual([
      'Hooli_100%',
      'Initech',
    ]);
    const beyond = await list(user, '?page=9');
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(5);
  });

  it('validates query parameters', async () => {
    const user = await seed();
    for (const qs of ['?pageSize=101', '?page=0', '?sort=salary', '?stage=hired']) {
      expect((await call(ctx.app, user, 'GET', `/v1/applications${qs}`)).status).toBe(400);
    }
  });
});
