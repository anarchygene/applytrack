import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, unwrap, type Application, type Stage } from '../api/client';
import { ApplicationForm, type ApplicationBody } from '../components/ApplicationForm';
import { RemindersPanel } from '../components/RemindersPanel';
import { TailoringPanel } from '../components/TailoringPanel';
import {
  Button,
  Card,
  CardTitle,
  ErrorBanner,
  Input,
  Select,
  Spinner,
  StageBadge,
} from '../components/ui';
import {
  allowedMoves,
  formatDate,
  formatDateTime,
  formatSalary,
  SOURCE_LABEL,
  STAGE_LABEL,
  WORK_MODE_LABEL,
} from '../lib/format';
import { useMoveStage } from './Board';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function StageControl({ application }: { application: Application }) {
  const options = allowedMoves(application.stage);
  const [stage, setStage] = useState<Stage>(options[0]!);
  const [note, setNote] = useState('');
  const move = useMoveStage();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    move.mutate({ id: application.id, stage, note }, { onSuccess: () => setNote('') });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Select aria-label="New stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
          {options.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </Select>
        <Button type="submit" disabled={move.isPending}>Move</Button>
      </div>
      <Input placeholder="Note (optional)" aria-label="Stage change note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <ErrorBanner error={move.error} />
    </form>
  );
}

function Timeline({ id }: { id: string }) {
  const timeline = useQuery({
    queryKey: ['timeline', id],
    queryFn: () => unwrap(api.GET('/v1/applications/{id}/timeline', { params: { path: { id } } })),
  });
  if (!timeline.data) return <Spinner />;
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {[...timeline.data].reverse().map((event) => (
        <li key={event.id} className="mb-4 ml-4 last:mb-0">
          <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-brand-500" />
          <p className="text-sm text-slate-900">
            {event.fromStage ? (
              <>Moved to <strong>{STAGE_LABEL[event.toStage]}</strong></>
            ) : (
              <>Added as <strong>{STAGE_LABEL[event.toStage]}</strong></>
            )}
          </p>
          {event.note && <p className="text-sm text-slate-600">“{event.note}”</p>}
          <time className="text-xs text-slate-500">{formatDateTime(event.occurredAt)}</time>
        </li>
      ))}
    </ol>
  );
}

export function ApplicationDetailPage() {
  const { id = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const app = useQuery({
    queryKey: ['application', id],
    queryFn: () => unwrap(api.GET('/v1/applications/{id}', { params: { path: { id } } })),
  });
  const save = useMutation({
    mutationFn: (body: ApplicationBody) =>
      unwrap(api.PATCH('/v1/applications/{id}', { params: { path: { id } }, body })),
    onSuccess: (updated) => {
      queryClient.setQueryData(['application', id], updated);
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/v1/applications/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      for (const key of ['applications', 'reminders', 'stats']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      navigate('/applications');
    },
  });

  if (app.isPending) return <Spinner />;
  if (!app.data) {
    return (
      <div className="space-y-4">
        <ErrorBanner error={app.error} />
        <Link to="/applications" className="text-sm text-brand-600 hover:underline">← Back to applications</Link>
      </div>
    );
  }
  const a = app.data;

  return (
    <>
      <Link to="/applications" className="text-sm text-slate-500 hover:text-slate-800">← Applications</Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{a.company}</h1>
          <p className="text-slate-600">{a.role}</p>
          <div className="mt-2"><StageBadge stage={a.stage} /></div>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button
              variant="ghost"
              className="text-rose-700"
              onClick={() => {
                if (confirm(`Delete ${a.company} — ${a.role}? This also removes its reminders and history.`)) remove.mutate();
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            {editing ? (
              <ApplicationForm
                application={a}
                onSubmit={(body) => save.mutate(body)}
                onCancel={() => {
                  setEditing(false);
                  save.reset();
                }}
                pending={save.isPending}
                error={save.error}
              />
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Detail label="Applied">{formatDate(a.appliedOn)}</Detail>
                  <Detail label="Location">{a.location ?? '—'}</Detail>
                  <Detail label="Arrangement">{a.workMode ? WORK_MODE_LABEL[a.workMode] : '—'}</Detail>
                  <Detail label="Salary">{formatSalary(a.salaryMin, a.salaryMax, a.salaryCurrency)}</Detail>
                  <Detail label="Source">{a.source ? SOURCE_LABEL[a.source] : '—'}</Detail>
                  <Detail label="Posting">
                    {a.postingUrl ? (
                      <a href={a.postingUrl} target="_blank" rel="noreferrer noopener" className="text-brand-600 hover:underline">
                        Open link ↗
                      </a>
                    ) : '—'}
                  </Detail>
                </dl>
                {a.notes && (
                  <div className="mt-5">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</h3>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{a.notes}</p>
                  </div>
                )}
                {a.jobDescription && (
                  <details className="mt-5">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">
                      Job description
                    </summary>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{a.jobDescription}</p>
                  </details>
                )}
              </>
            )}
          </Card>
          <TailoringPanel application={a} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Change stage</CardTitle>
            <StageControl key={a.stage} application={a} />
          </Card>
          <RemindersPanel applicationId={a.id} />
          <Card>
            <CardTitle>Timeline</CardTitle>
            <Timeline id={a.id} />
          </Card>
        </div>
      </div>
      <div className="mt-4"><ErrorBanner error={remove.error} /></div>
    </>
  );
}
