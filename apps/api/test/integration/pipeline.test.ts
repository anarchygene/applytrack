import { describe, expect, it } from 'vitest';
import { call, createApplication, registerUser, useTestApp } from '../helpers/app.js';

describe('hiring pipeline', () => {
  // 2026-11-05 18:00 UTC = 2026-11-06 02:00 in Singapore.
  const ctx = useTestApp({ now: new Date('2026-11-05T18:00:00Z') });

  const move = (user: Parameters<typeof call>[1], id: string, body: object) =>
    call(ctx.app, user, 'POST', `/v1/applications/${id}/stage`, body);

  it('records each stage change in an ordered timeline', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);

    await move(user, app.id, { stage: 'applied', occurredAt: '2026-11-01T01:00:00Z' });
    await move(user, app.id, { stage: 'screening', note: 'Recruiter call booked' });
    const rejected = await move(user, app.id, { stage: 'rejected' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.stage).toBe('rejected');

    const timeline = await call(ctx.app, user, 'GET', `/v1/applications/${app.id}/timeline`);
    expect(timeline.body.map((e: { fromStage: string; toStage: string }) => [e.fromStage, e.toStage])).toEqual([
      [null, 'wishlist'],
      ['wishlist', 'applied'],
      ['applied', 'screening'],
      ['screening', 'rejected'],
    ]);
    expect(timeline.body[2].note).toBe('Recruiter call booked');
  });

  it('refuses moving to the same stage and out of a closed stage, except reopening', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user, { stage: 'applied' });

    const same = await move(user, app.id, { stage: 'applied' });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('stage_unchanged');

    await move(user, app.id, { stage: 'rejected' });
    const blocked = await move(user, app.id, { stage: 'screening' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('invalid_transition');

    const reopened = await move(user, app.id, { stage: 'applied' });
    expect(reopened.status).toBe(200);
  });

  it("sets appliedOn once, as a date in the user's time zone", async () => {
    const user = await registerUser(ctx.app); // Asia/Singapore
    const app = await createApplication(ctx.app, user);
    expect(app.appliedOn).toBeNull();

    const applied = await move(user, app.id, { stage: 'applied' });
    expect(applied.body.appliedOn).toBe('2026-11-06');

    await move(user, app.id, { stage: 'withdrawn' });
    const reopened = await move(user, app.id, {
      stage: 'applied',
      occurredAt: '2026-11-05T12:00:00Z',
    });
    expect(reopened.body.appliedOn).toBe('2026-11-06');
  });

  it('sets appliedOn when skipping straight past applied, but not for withdrawn', async () => {
    const user = await registerUser(ctx.app, { timezone: 'America/New_York' });
    const skipped = await createApplication(ctx.app, user);
    expect((await move(user, skipped.id, { stage: 'interviewing' })).body.appliedOn).toBe(
      '2026-11-05',
    );

    const gaveUp = await createApplication(ctx.app, user);
    expect((await move(user, gaveUp.id, { stage: 'withdrawn' })).body.appliedOn).toBeNull();
  });

  it('uses a supplied appliedOn when creating directly in a submitted stage', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user, {
      stage: 'applied',
      appliedOn: '2026-10-20',
    });
    expect(app.appliedOn).toBe('2026-10-20');
  });

  it('validates stage change input', async () => {
    const user = await registerUser(ctx.app);
    const app = await createApplication(ctx.app, user);
    expect((await move(user, app.id, { stage: 'applied', note: 'n'.repeat(1001) })).status).toBe(400);
    expect((await move(user, app.id, { stage: 'hired' })).status).toBe(400);
    const future = await move(user, app.id, {
      stage: 'applied',
      occurredAt: '2026-11-06T18:00:00Z',
    });
    expect(future.status).toBe(400);
    expect(future.body.errors[0].path).toBe('body.occurredAt');
  });
});
