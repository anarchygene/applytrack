import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api, unwrap, type Reminder } from '../api/client';
import { formatDate, todayIso } from '../lib/format';
import { Button, Card, CardTitle, ErrorBanner, Input, cx } from './ui';

export function useReminderMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['reminders'] });
  const toggle = useMutation({
    mutationFn: (r: Reminder) =>
      unwrap(
        api.PATCH('/v1/reminders/{id}', {
          params: { path: { id: r.id } },
          body: { completed: !r.completedAt },
        }),
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/v1/reminders/{id}', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
  return { toggle, remove };
}

export function ReminderRow({
  reminder,
  tone,
  showApplication,
}: {
  reminder: Reminder;
  tone?: 'overdue' | 'today';
  showApplication?: boolean;
}) {
  const { toggle, remove } = useReminderMutations();
  const done = Boolean(reminder.completedAt);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        className="mt-1 size-4 rounded border-slate-300 accent-brand-600"
        checked={done}
        aria-label={`Mark "${reminder.title}" as ${done ? 'not done' : 'done'}`}
        onChange={() => toggle.mutate(reminder)}
      />
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm', done ? 'text-slate-400 line-through' : 'text-slate-900')}>
          {reminder.title}
          {reminder.isAuto && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">auto</span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          <span
            className={cx(
              tone === 'overdue' && 'font-medium text-rose-700',
              tone === 'today' && 'font-medium text-amber-700',
            )}
          >
            {tone === 'overdue' ? 'Overdue · ' : tone === 'today' ? 'Today · ' : ''}
            {formatDate(reminder.dueOn)}
          </span>
          {showApplication && (
            <>
              {' · '}
              <Link to={`/applications/${reminder.applicationId}`} className="hover:text-brand-700 hover:underline">
                {reminder.application.company} — {reminder.application.role}
              </Link>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        className="text-xs text-slate-400 hover:text-rose-700"
        onClick={() => remove.mutate(reminder.id)}
        aria-label={`Delete reminder "${reminder.title}"`}
      >
        Delete
      </button>
    </li>
  );
}

export function RemindersPanel({ applicationId }: { applicationId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState(todayIso());
  const query = { applicationId, includeCompleted: 'true' as const };
  const list = useQuery({
    queryKey: ['reminders', query],
    queryFn: () => unwrap(api.GET('/v1/reminders', { params: { query } })),
  });
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/v1/applications/{id}/reminders', {
          params: { path: { id: applicationId } },
          body: { title, dueOn },
        }),
      ),
    onSuccess: () => {
      setTitle('');
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };
  const data = list.data;
  const open = data ? [...data.overdue, ...data.dueToday, ...data.upcoming] : [];
  const tone = (r: Reminder) =>
    data?.overdue.includes(r) ? 'overdue' : data?.dueToday.includes(r) ? 'today' : undefined;

  return (
    <Card>
      <CardTitle>Reminders</CardTitle>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          required
          maxLength={200}
          placeholder="e.g. Email the recruiter"
          aria-label="Reminder title"
          className="min-w-40 flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input type="date" required aria-label="Due date" className="w-40" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        <Button type="submit" disabled={add.isPending}>Add</Button>
      </form>
      <div className="mt-2"><ErrorBanner error={add.error ?? list.error} /></div>
      {open.length === 0 && data?.completed.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No reminders for this application.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {open.map((r) => <ReminderRow key={r.id} reminder={r} tone={tone(r)} />)}
          {data?.completed.map((r) => <ReminderRow key={r.id} reminder={r} />)}
        </ul>
      )}
    </Card>
  );
}
