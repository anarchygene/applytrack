import { useState, type FormEvent } from 'react';
import { ApiError, type Application, type Source, type Stage, type WorkMode } from '../api/client';
import type { paths } from '../api/schema';
import { SOURCE_LABEL, SOURCES, STAGE_LABEL, STAGES, WORK_MODE_LABEL, WORK_MODES } from '../lib/format';
import { Button, ErrorBanner, Field, Input, Select, Textarea } from './ui';

export type ApplicationBody =
  paths['/v1/applications']['post']['requestBody']['content']['application/json'];

interface Values {
  company: string;
  role: string;
  postingUrl: string;
  location: string;
  workMode: WorkMode | '';
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  source: Source | '';
  stage: Stage;
  jobDescription: string;
  notes: string;
}

function initialValues(app?: Application): Values {
  return {
    company: app?.company ?? '',
    role: app?.role ?? '',
    postingUrl: app?.postingUrl ?? '',
    location: app?.location ?? '',
    workMode: app?.workMode ?? '',
    salaryMin: app?.salaryMin?.toString() ?? '',
    salaryMax: app?.salaryMax?.toString() ?? '',
    salaryCurrency: app?.salaryCurrency ?? 'SGD',
    source: app?.source ?? '',
    stage: app?.stage ?? 'wishlist',
    jobDescription: app?.jobDescription ?? '',
    notes: app?.notes ?? '',
  };
}

function toBody(v: Values, includeStage: boolean): ApplicationBody {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    company: v.company,
    role: v.role,
    postingUrl: v.postingUrl.trim() || null,
    location: v.location,
    workMode: v.workMode || null,
    salaryMin: num(v.salaryMin),
    salaryMax: num(v.salaryMax),
    salaryCurrency: v.salaryCurrency,
    source: v.source || null,
    jobDescription: v.jobDescription,
    notes: v.notes,
    ...(includeStage ? { stage: v.stage } : {}),
  };
}

export function ApplicationForm({
  application,
  onSubmit,
  onCancel,
  pending,
  error,
}: {
  application?: Application;
  onSubmit: (body: ApplicationBody) => void;
  onCancel: () => void;
  pending: boolean;
  error: unknown;
}) {
  const [v, setV] = useState(() => initialValues(application));
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setV({ ...v, [key]: value });
  const err = error instanceof ApiError ? error : null;
  const fe = (field: string) => err?.fieldError(field);
  const isNew = !application;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(toBody(v, isNew));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company *" error={fe('company')}>
          <Input required maxLength={200} value={v.company} onChange={(e) => set('company', e.target.value)} />
        </Field>
        <Field label="Role *" error={fe('role')}>
          <Input required maxLength={200} value={v.role} onChange={(e) => set('role', e.target.value)} />
        </Field>
        <Field label="Job posting URL" error={fe('postingUrl')}>
          <Input type="url" placeholder="https://" value={v.postingUrl} onChange={(e) => set('postingUrl', e.target.value)} />
        </Field>
        <Field label="Location" error={fe('location')}>
          <Input maxLength={200} value={v.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Work arrangement">
          <Select value={v.workMode} onChange={(e) => set('workMode', e.target.value as WorkMode | '')}>
            <option value="">Not specified</option>
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>{WORK_MODE_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={v.source} onChange={(e) => set('source', e.target.value as Source | '')}>
            <option value="">Not specified</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_1fr_6rem] gap-2 sm:col-span-2">
          <Field label="Salary from (monthly)" error={fe('salaryMin')}>
            <Input type="number" min={0} value={v.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
          </Field>
          <Field label="Salary to" error={fe('salaryMax')}>
            <Input type="number" min={0} value={v.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} />
          </Field>
          <Field label="Currency" error={fe('salaryCurrency')}>
            <Input maxLength={3} value={v.salaryCurrency} onChange={(e) => set('salaryCurrency', e.target.value.toUpperCase())} />
          </Field>
        </div>
        {isNew && (
          <Field label="Stage">
            <Select value={v.stage} onChange={(e) => set('stage', e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field label="Job description" hint="Paste the posting — used for AI tailoring" error={fe('jobDescription')}>
        <Textarea rows={5} maxLength={20_000} value={v.jobDescription} onChange={(e) => set('jobDescription', e.target.value)} />
      </Field>
      <Field label="Notes" error={fe('notes')}>
        <Textarea rows={3} maxLength={10_000} value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      {error && !err?.problem.errors ? <ErrorBanner error={error} /> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : isNew ? 'Add application' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
