import type { Db } from '../../db/client.js';
import { STAGES, type Stage } from '../../db/schema.js';
import { todayIn } from '../../domain/dates.js';
import type { AuthUser } from '../../lib/auth.js';
import * as repo from './repository.js';

const rate = (part: number, whole: number) => (whole === 0 ? null : part / whole);
const round = (value: number | null, digits: number) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;

export async function getStats(db: Db, user: AuthUser, now: Date) {
  const today = todayIn(user.timezone, now);
  const [funnel, byStageRows, weekly] = await Promise.all([
    repo.funnel(db, user.id, user.timezone),
    repo.countsByStage(db, user.id),
    repo.weeklySubmissions(db, user.id, today),
  ]);

  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const row of byStageRows) byStage[row.stage] = row.count;
  const all = Object.values(byStage).reduce((sum, n) => sum + n, 0);

  const total = funnel.find((r) => r.isTotal) ?? {
    submitted: 0,
    responded: 0,
    offers: 0,
    avgDaysToFirstResponse: null,
  };

  return {
    totals: {
      all,
      submitted: total.submitted,
      responded: total.responded,
      offers: total.offers,
    },
    byStage,
    responseRate: round(rate(total.responded, total.submitted), 4),
    offerRate: round(rate(total.offers, total.submitted), 4),
    avgDaysToFirstResponse: round(total.avgDaysToFirstResponse, 1),
    weekly,
    bySource: funnel
      .filter((r) => !r.isTotal)
      .map((r) => ({
        source: r.source ?? ('unknown' as const),
        submitted: r.submitted,
        responded: r.responded,
        responseRate: round(rate(r.responded, r.submitted), 4),
      }))
      .sort((a, b) => b.submitted - a.submitted || a.source.localeCompare(b.source)),
  };
}
