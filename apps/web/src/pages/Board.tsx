import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { api, unwrap, type ApplicationSummary, type Stage } from '../api/client';
import { ErrorBanner, PageHeader, Select, Spinner, cx } from '../components/ui';
import { allowedMoves, CLOSED_STAGES, OPEN_STAGES, STAGE_LABEL, STAGES } from '../lib/format';

export function useMoveStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, note }: { id: string; stage: Stage; note?: string }) =>
      unwrap(
        api.POST('/v1/applications/{id}/stage', {
          params: { path: { id } },
          body: { stage, ...(note ? { note } : {}) },
        }),
      ),
    onSuccess: (app) => {
      queryClient.setQueryData(['application', app.id], app);
      for (const key of ['applications', 'timeline', 'reminders', 'stats']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

function BoardCard({ app, onMove }: { app: ApplicationSummary; onMove: (stage: Stage) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ id: app.id, from: app.stage }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="cursor-grab rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 active:cursor-grabbing"
    >
      <Link to={`/applications/${app.id}`} className="block font-medium text-slate-900 hover:text-brand-700">
        {app.company}
      </Link>
      <p className="text-sm text-slate-500">{app.role}</p>
      <Select
        aria-label={`Move ${app.company} to another stage`}
        className="mt-2 py-1 text-xs"
        value=""
        onChange={(e) => e.target.value && onMove(e.target.value as Stage)}
      >
        <option value="">Move to…</option>
        {allowedMoves(app.stage).map((s) => (
          <option key={s} value={s}>{STAGE_LABEL[s]}</option>
        ))}
      </Select>
    </div>
  );
}

export function BoardPage() {
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const list = useQuery({
    queryKey: ['applications', 'board'],
    queryFn: () =>
      unwrap(api.GET('/v1/applications', { params: { query: { pageSize: 100, sort: 'updatedAt' } } })),
  });
  const move = useMoveStage();

  const byStage = new Map<Stage, ApplicationSummary[]>(STAGES.map((s) => [s, []]));
  for (const app of list.data?.items ?? []) byStage.get(app.stage)!.push(app);

  const onDrop = (stage: Stage) => (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const { id, from } = JSON.parse(e.dataTransfer.getData('text/plain')) as { id: string; from: Stage };
    if (from !== stage) move.mutate({ id, stage });
  };

  const column = (stage: Stage, compact = false) => (
    <div
      key={stage}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(stage);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={onDrop(stage)}
      className={cx(
        'flex w-64 shrink-0 flex-col rounded-xl p-3 transition',
        compact ? 'bg-slate-100/60' : 'bg-slate-100',
        dragOver === stage && 'ring-2 ring-brand-500',
      )}
    >
      <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700">
        {STAGE_LABEL[stage]}
        <span className="rounded-full bg-white px-2 text-xs font-medium text-slate-500">
          {byStage.get(stage)!.length}
        </span>
      </h2>
      <div className="flex flex-1 flex-col gap-2">
        {byStage.get(stage)!.map((app) => (
          <BoardCard key={app.id} app={app} onMove={(to) => move.mutate({ id: app.id, stage: to })} />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Pipeline board">
        Drag cards between columns, or use “Move to…”. Closed stages can only be reopened to Applied.
      </PageHeader>
      <div className="mb-4">
        <ErrorBanner error={move.error ?? list.error} />
      </div>
      {list.isPending ? (
        <Spinner />
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
          {OPEN_STAGES.map((s) => column(s))}
          <div className="w-px shrink-0 bg-slate-200" />
          {CLOSED_STAGES.map((s) => column(s, true))}
        </div>
      )}
    </>
  );
}
