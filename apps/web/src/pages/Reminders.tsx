import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap, type Reminder } from '../api/client';
import { ReminderRow } from '../components/RemindersPanel';
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui';

function Group({ title, items, tone }: { title: string; items: Reminder[]; tone?: 'overdue' | 'today' }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-700">
        {title} <span className="font-normal text-slate-400">({items.length})</span>
      </h2>
      <ul className="mt-1 divide-y divide-slate-100">
        {items.map((r) => <ReminderRow key={r.id} reminder={r} tone={tone} showApplication />)}
      </ul>
    </Card>
  );
}

export function RemindersPage() {
  const [showCompleted, setShowCompleted] = useState(false);
  const query = { includeCompleted: showCompleted ? ('true' as const) : ('false' as const) };
  const list = useQuery({
    queryKey: ['reminders', query],
    queryFn: () => unwrap(api.GET('/v1/reminders', { params: { query } })),
  });
  const d = list.data;
  const openCount = d ? d.overdue.length + d.dueToday.length + d.upcoming.length : 0;

  return (
    <>
      <PageHeader
        title="Reminders"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed
          </label>
        }
      >
        {d ? `${openCount} open · today is ${new Date(`${d.today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}` : ' '}
      </PageHeader>
      <ErrorBanner error={list.error} />
      {list.isPending ? (
        <Spinner />
      ) : d && openCount === 0 && d.completed.length === 0 ? (
        <EmptyState title="You're all caught up">
          Follow-up reminders are created automatically when you mark an application as applied.
        </EmptyState>
      ) : (
        d && (
          <div className="space-y-4">
            <Group title="Overdue" items={d.overdue} tone="overdue" />
            <Group title="Due today" items={d.dueToday} tone="today" />
            <Group title="Upcoming" items={d.upcoming} />
            <Group title="Completed" items={d.completed} />
          </div>
        )
      )}
    </>
  );
}
