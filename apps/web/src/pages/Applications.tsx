import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, unwrap, type Source, type Stage } from '../api/client';
import { ApplicationForm, type ApplicationBody } from '../components/ApplicationForm';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Select,
  Spinner,
  StageBadge,
} from '../components/ui';
import {
  formatDate,
  SOURCE_LABEL,
  SOURCES,
  STAGE_LABEL,
  STAGES,
  WORK_MODE_LABEL,
} from '../lib/format';

type Sort = 'createdAt' | 'updatedAt' | 'appliedOn' | 'company';
const SORTS: Record<Sort, string> = {
  createdAt: 'Recently added',
  updatedAt: 'Recently updated',
  appliedOn: 'Applied date',
  company: 'Company A–Z',
};

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const q = params.get('q') ?? undefined;
  const stage = (params.get('stage') as Stage | null) ?? undefined;
  const source = (params.get('source') as Source | null) ?? undefined;
  const sort = (params.get('sort') as Sort | null) ?? 'createdAt';
  const page = Number(params.get('page') ?? '1');

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounce typing into the URL (and therefore the query).
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search || undefined) !== q) update({ q: search || undefined });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = {
    q,
    stage: stage ? [stage] : undefined,
    source,
    sort,
    order: sort === 'company' ? ('asc' as const) : ('desc' as const),
    page,
    pageSize: 20,
  };
  const list = useQuery({
    queryKey: ['applications', query],
    queryFn: () => unwrap(api.GET('/v1/applications', { params: { query } })),
    placeholderData: keepPreviousData,
  });

  const create = useMutation({
    mutationFn: (body: ApplicationBody) => unwrap(api.POST('/v1/applications', { body })),
    onSuccess: (app) => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      navigate(`/applications/${app.id}`);
    },
  });

  const data = list.data;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(q || stage || source);

  return (
    <>
      <PageHeader
        title="Applications"
        actions={!creating && <Button onClick={() => setCreating(true)}>+ New application</Button>}
      >
        {data ? `${data.total} ${filtered ? 'matching' : 'in total'}` : ' '}
      </PageHeader>

      {creating && (
        <Card className="mb-6">
          <h2 className="mb-4 font-semibold">New application</h2>
          <ApplicationForm
            onSubmit={(body) => create.mutate(body)}
            onCancel={() => {
              setCreating(false);
              create.reset();
            }}
            pending={create.isPending}
            error={create.error}
          />
        </Card>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input
          type="search"
          placeholder="Search company or role…"
          aria-label="Search applications"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select aria-label="Filter by stage" value={stage ?? ''} onChange={(e) => update({ stage: e.target.value || undefined })}>
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
          ))}
        </Select>
        <Select aria-label="Filter by source" value={source ?? ''} onChange={(e) => update({ source: e.target.value || undefined })}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
          ))}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value })}>
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </div>

      <ErrorBanner error={list.error} />
      {list.isPending ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <EmptyState title={filtered ? 'No applications match these filters' : 'No applications yet'}>
          {filtered ? 'Try a different search or filter.' : 'Add the first job you are interested in.'}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Company & role</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Where</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Applied</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.items.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/applications/${app.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {app.company}
                    </Link>
                    <div className="text-slate-500">{app.role}</div>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={app.stage} /></td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {[app.location, app.workMode && WORK_MODE_LABEL[app.workMode]].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{formatDate(app.appliedOn)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{formatDate(app.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>Page {page} of {lastPage}</span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</Button>
                <Button variant="secondary" disabled={page >= lastPage} onClick={() => update({ page: String(page + 1) })}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
