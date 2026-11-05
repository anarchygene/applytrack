import { count, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { applications, type Source, type Stage } from '../../db/schema.js';
import { OFFER_STAGES, RESPONSE_STAGES } from '../../domain/stages.js';

export interface FunnelRow {
  /** `null` with `isTotal = true` is the overall row; `null` with `isTotal = false` is "unknown". */
  source: Source | null;
  isTotal: boolean;
  submitted: number;
  responded: number;
  offers: number;
  avgDaysToFirstResponse: number | null;
}

const stageList = (stages: readonly Stage[]) =>
  sql.join(
    stages.map((s) => sql`${s}::stage`),
    sql`, `,
  );

/**
 * Submitted applications with their first response and whether they reached an offer,
 * aggregated overall and per source in one pass with ROLLUP.
 */
export async function funnel(db: DbOrTx, userId: string, timezone: string): Promise<FunnelRow[]> {
  const result = await db.execute<{
    source: Source | null;
    is_total: number;
    submitted: number;
    responded: number;
    offers: number;
    avg_days: number | null;
  }>(sql`
    WITH submitted AS (
      SELECT
        a.source,
        a.applied_on,
        (
          SELECT min(e.occurred_at) FROM stage_events e
          WHERE e.application_id = a.id AND e.to_stage IN (${stageList(RESPONSE_STAGES)})
        ) AS first_response_at,
        EXISTS (
          SELECT 1 FROM stage_events e
          WHERE e.application_id = a.id AND e.to_stage IN (${stageList(OFFER_STAGES)})
        ) AS got_offer
      FROM applications a
      WHERE a.user_id = ${userId} AND a.applied_on IS NOT NULL
    )
    SELECT
      source,
      GROUPING(source) AS is_total,
      count(*)::int AS submitted,
      count(first_response_at)::int AS responded,
      (count(*) FILTER (WHERE got_offer))::int AS offers,
      avg(GREATEST(0, (first_response_at AT TIME ZONE ${timezone})::date - applied_on))::float8
        AS avg_days
    FROM submitted
    GROUP BY ROLLUP (source)
  `);
  return result.rows.map((r) => ({
    source: r.source,
    isTotal: r.is_total === 1,
    submitted: r.submitted,
    responded: r.responded,
    offers: r.offers,
    avgDaysToFirstResponse: r.avg_days,
  }));
}

export async function countsByStage(db: DbOrTx, userId: string) {
  return db
    .select({ stage: applications.stage, count: count() })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.stage);
}

/** Submissions per ISO week (Monday start) for the 12 weeks ending with `today`'s week. */
export async function weeklySubmissions(db: DbOrTx, userId: string, today: string) {
  const result = await db.execute<{ week_start: string; count: number }>(sql`
    SELECT to_char(week, 'YYYY-MM-DD') AS week_start, count(a.id)::int AS count
    FROM generate_series(
      date_trunc('week', ${today}::date) - interval '11 weeks',
      date_trunc('week', ${today}::date),
      interval '1 week'
    ) AS week
    LEFT JOIN applications a
      ON a.user_id = ${userId}
      AND a.applied_on >= week::date
      AND a.applied_on < (week + interval '1 week')::date
    GROUP BY week
    ORDER BY week
  `);
  return result.rows.map((r) => ({ weekStart: r.week_start, count: r.count }));
}
