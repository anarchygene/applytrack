import { describe, expect, it } from 'vitest';
import { call, createApplication, registerUser, useTestApp, type TestUser } from '../helpers/app.js';

const NOW = new Date('2026-11-05T04:00:00Z'); // Thursday, 12:00 in Singapore

/**
 * Reference dataset (SC-004). Expected values were calculated by hand:
 * - 10 submitted (applied_on set), 2 wishlist
 * - responded: #1 (4 days), #2 (10 days), #3 (1 day) → rate 3/10, avg 5.0 days
 * - offers: #3 → rate 1/10
 * - #4 was rejected straight from applied, which is not a response
 */
const SUBMITTED: { appliedOn: string; source: string; moves: [string, string][] }[] = [
  { appliedOn: '2026-10-01', source: 'linkedin', moves: [['screening', '2026-10-05T02:00:00Z']] },
  {
    appliedOn: '2026-10-10',
    source: 'linkedin',
    moves: [
      ['screening', '2026-10-20T02:00:00Z'],
      ['interviewing', '2026-10-25T02:00:00Z'],
    ],
  },
  {
    appliedOn: '2026-10-15',
    source: 'referral',
    moves: [
      ['interviewing', '2026-10-16T03:00:00Z'],
      ['offer', '2026-10-30T03:00:00Z'],
    ],
  },
  { appliedOn: '2026-10-01', source: 'linkedin', moves: [['rejected', '2026-10-08T02:00:00Z']] },
  { appliedOn: '2026-10-27', source: 'linkedin', moves: [] },
  { appliedOn: '2026-10-28', source: 'referral', moves: [] },
  { appliedOn: '2026-11-03', source: 'linkedin', moves: [] },
  { appliedOn: '2026-11-03', source: 'referral', moves: [] },
  { appliedOn: '2026-11-05', source: 'linkedin', moves: [] },
  { appliedOn: '2026-08-10', source: 'referral', moves: [] }, // outside the 12-week window
];

describe('statistics', () => {
  const ctx = useTestApp({ now: NOW });

  async function seedReference(user: TestUser) {
    for (const spec of SUBMITTED) {
      ctx.clock.now = new Date(`${spec.appliedOn}T02:00:00Z`);
      const app = await createApplication(ctx.app, user, {
        stage: 'applied',
        appliedOn: spec.appliedOn,
        source: spec.source,
      });
      for (const [stage, at] of spec.moves) {
        ctx.clock.now = new Date(at);
        const res = await call(ctx.app, user, 'POST', `/v1/applications/${app.id}/stage`, { stage });
        expect(res.status).toBe(200);
      }
    }
    ctx.clock.now = NOW;
    await createApplication(ctx.app, user, { source: 'linkedin' });
    await createApplication(ctx.app, user);
  }

  it('matches the hand-calculated reference values', async () => {
    const user = await registerUser(ctx.app);
    await seedReference(user);

    const { status, body } = await call(ctx.app, user, 'GET', '/v1/stats');
    expect(status).toBe(200);
    expect(body.totals).toEqual({ all: 12, submitted: 10, responded: 3, offers: 1 });
    expect(body.byStage).toEqual({
      wishlist: 2,
      applied: 6,
      screening: 1,
      interviewing: 1,
      offer: 1,
      accepted: 0,
      rejected: 1,
      withdrawn: 0,
    });
    expect(body.responseRate).toBe(0.3);
    expect(body.offerRate).toBe(0.1);
    expect(body.avgDaysToFirstResponse).toBe(5);

    expect(body.weekly).toHaveLength(12);
    expect(body.weekly[0]).toEqual({ weekStart: '2026-08-17', count: 0 });
    expect(body.weekly.at(-1)).toEqual({ weekStart: '2026-11-02', count: 3 });
    const byWeek = Object.fromEntries(
      body.weekly.map((w: { weekStart: string; count: number }) => [w.weekStart, w.count]),
    );
    expect(byWeek).toMatchObject({
      '2026-09-28': 2,
      '2026-10-05': 1,
      '2026-10-12': 1,
      '2026-10-19': 0,
      '2026-10-26': 2,
    });

    expect(body.bySource).toEqual([
      { source: 'linkedin', submitted: 6, responded: 2, responseRate: 0.3333 },
      { source: 'referral', submitted: 4, responded: 1, responseRate: 0.25 },
    ]);
  });

  it('returns zeros and "not enough data" for an empty account', async () => {
    const user = await registerUser(ctx.app);
    const { body } = await call(ctx.app, user, 'GET', '/v1/stats');
    expect(body.totals).toEqual({ all: 0, submitted: 0, responded: 0, offers: 0 });
    expect(body.responseRate).toBeNull();
    expect(body.offerRate).toBeNull();
    expect(body.avgDaysToFirstResponse).toBeNull();
    expect(body.weekly).toHaveLength(12);
    expect(body.weekly.every((w: { count: number }) => w.count === 0)).toBe(true);
    expect(body.bySource).toEqual([]);
  });

  it('groups applications without a source as "unknown"', async () => {
    const user = await registerUser(ctx.app);
    await createApplication(ctx.app, user, { stage: 'applied' });
    const { body } = await call(ctx.app, user, 'GET', '/v1/stats');
    expect(body.bySource).toEqual([
      { source: 'unknown', submitted: 1, responded: 0, responseRate: 0 },
    ]);
  });
});
