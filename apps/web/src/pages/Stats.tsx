import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap, type Stats } from '../api/client';
import { Card, CardTitle, ErrorBanner, PageHeader, Spinner } from '../components/ui';
import { formatPercent, SOURCE_LABEL, STAGE_LABEL, STAGES } from '../lib/format';

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const shortWeek = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Single-series column chart: 12 weeks of submissions with a per-column hover tooltip. */
function WeeklyChart({ weekly }: { weekly: Stats['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 16, right: 8, bottom: 28, left: 28 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(4, ...weekly.map((w) => w.count));
  const niceMax = Math.ceil(max / 2) * 2;
  const ticks = [0, niceMax / 2, niceMax];
  const band = plotW / weekly.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => pad.top + plotH - (v / niceMax) * plotH;
  const peak = weekly.reduce((best, w, i) => (w.count > (weekly[best]?.count ?? 0) ? i : best), 0);

  // Rounded 4px data-end at the top, square at the baseline.
  const columnPath = (x: number, top: number, bottom: number) => {
    const r = Math.min(4, (bottom - top) / 2, barW / 2);
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bottom}Z`;
  };

  return (
    <div className="viz-root relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Applications submitted per week, last 12 weeks">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-secondary)">
              {t}
            </text>
          </g>
        ))}
        {weekly.map((w, i) => {
          const x = pad.left + band * i + (band - barW) / 2;
          const showLabel = i === peak && w.count > 0;
          return (
            <g key={w.weekStart}>
              {w.count > 0 && (
                <path
                  d={columnPath(x, y(w.count), y(0))}
                  fill="var(--series-1)"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {showLabel && (
                <text x={x + barW / 2} y={y(w.count) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">
                  {w.count}
                </text>
              )}
              {(i % 2 === 1 || i === weekly.length - 1) && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-secondary)">
                  {shortWeek(w.weekStart)}
                </text>
              )}
              {/* Hit target spans the whole band, larger than the mark. */}
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover !== null && weekly[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{
            left: `${((pad.left + band * hover + band / 2) / W) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          Week of {shortWeek(weekly[hover].weekStart)}
          <div className="font-semibold">{weekly[hover].count} submitted</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Applications submitted per week</caption>
        <tbody>
          {weekly.map((w) => (
            <tr key={w.weekStart}><th>{w.weekStart}</th><td>{w.count}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars, one hue (magnitude), value at the tip. */
function StageBars({ byStage }: { byStage: Stats['byStage'] }) {
  const max = Math.max(1, ...STAGES.map((s) => byStage[s]));
  return (
    <ul className="viz-root space-y-2.5">
      {STAGES.map((s) => (
        <li key={s} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-slate-600">{STAGE_LABEL[s]}</span>
          <div className="flex items-center gap-2">
            <div
              className="h-4 rounded-r"
              style={{
                width: `${(byStage[s] / max) * 85}%`,
                minWidth: byStage[s] > 0 ? 4 : 0,
                background: 'var(--series-1)',
              }}
              title={`${STAGE_LABEL[s]}: ${byStage[s]}`}
            />
            <span className="text-xs font-medium text-slate-700 tabular-nums">{byStage[s]}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatsPage() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => unwrap(api.GET('/v1/stats')) });
  const s = stats.data;

  return (
    <>
      <PageHeader title="Statistics">How your job search is going.</PageHeader>
      <ErrorBanner error={stats.error} />
      {!s ? (
        stats.isPending && <Spinner />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label="Tracked" value={String(s.totals.all)} />
            <StatTile label="Submitted" value={String(s.totals.submitted)} />
            <StatTile
              label="Response rate"
              value={formatPercent(s.responseRate)}
              hint={s.responseRate === null ? 'Not enough data' : `${s.totals.responded} reached screening+`}
            />
            <StatTile
              label="Offer rate"
              value={formatPercent(s.offerRate)}
              hint={s.offerRate === null ? 'Not enough data' : `${s.totals.offers} offer(s)`}
            />
            <StatTile
              label="Days to response"
              value={s.avgDaysToFirstResponse === null ? '—' : String(s.avgDaysToFirstResponse)}
              hint="Average, applied → first reply"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardTitle>Applications submitted per week</CardTitle>
              <WeeklyChart weekly={s.weekly} />
            </Card>
            <Card>
              <CardTitle>Current pipeline</CardTitle>
              <StageBars byStage={s.byStage} />
            </Card>
          </div>

          <Card>
            <CardTitle>Response rate by source</CardTitle>
            {s.bySource.length === 0 ? (
              <p className="text-sm text-slate-500">Submit some applications to compare sources.</p>
            ) : (
              <table className="viz-root w-full text-sm">
                <thead className="text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 text-right font-medium">Submitted</th>
                    <th className="pb-2 text-right font-medium">Responded</th>
                    <th className="w-2/5 pb-2 pl-6 font-medium">Response rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.bySource.map((row) => (
                    <tr key={row.source}>
                      <td className="py-2 text-slate-800">{SOURCE_LABEL[row.source]}</td>
                      <td className="py-2 text-right tabular-nums">{row.submitted}</td>
                      <td className="py-2 text-right tabular-nums">{row.responded}</td>
                      <td className="py-2 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                            <div
                              className="h-2.5 rounded-full"
                              style={{ width: `${(row.responseRate ?? 0) * 100}%`, background: 'var(--series-1)' }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs font-medium tabular-nums">
                            {formatPercent(row.responseRate)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
