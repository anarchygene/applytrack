import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, unwrap } from '../api/client';
import { ME_KEY, useMe } from '../auth';
import { useAiStatus } from '../components/TailoringPanel';
import { Button, Card, CardTitle, ErrorBanner, Field, Input, PageHeader, Select, Textarea } from '../components/ui';

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

function ProfileCard() {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Singapore');
  const save = useMutation({
    mutationFn: () => unwrap(api.PATCH('/v1/me', { body: { name, timezone } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(ME_KEY, updated);
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Card>
      <CardTitle>Profile</CardTitle>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Name">
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Time zone" hint="Used to decide when reminders are due and to group statistics by week">
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        </Field>
        <ErrorBanner error={save.error} />
        <div className="flex items-center justify-end gap-3">
          {save.isSuccess && <span className="text-sm text-emerald-700">Saved</span>}
          <Button type="submit" disabled={save.isPending}>Save profile</Button>
        </div>
      </form>
    </Card>
  );
}

function ResumeCard() {
  const resume = useQuery({ queryKey: ['resume'], queryFn: () => unwrap(api.GET('/v1/me/resume')) });
  if (!resume.data) {
    return (
      <Card>
        <CardTitle>Base resume</CardTitle>
        <ErrorBanner error={resume.error} />
      </Card>
    );
  }
  return <ResumeEditor initial={resume.data.text ?? ''} />;
}

function ResumeEditor({ initial }: { initial: string }) {
  const ai = useAiStatus();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initial);
  const save = useMutation({
    mutationFn: () => unwrap(api.PUT('/v1/me/resume', { body: { text } })),
    onSuccess: (data) => queryClient.setQueryData(['resume'], data),
  });

  return (
    <Card>
      <CardTitle>Base resume</CardTitle>
      <p className="mb-3 text-sm text-slate-500">
        Paste your resume as plain text. It is used only for AI tailoring
        {ai.data && !ai.data.available ? ` (currently unavailable: ${ai.data.reason})` : ''}.
      </p>
      <Textarea rows={12} maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Resume text" />
      <div className="mt-1 text-right text-xs text-slate-400">{text.length.toLocaleString()} / 20,000</div>
      <ErrorBanner error={save.error} />
      <div className="mt-3 flex items-center justify-end gap-3">
        {save.isSuccess && <span className="text-sm text-emerald-700">Saved</span>}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Save resume</Button>
      </div>
    </Card>
  );
}

function DangerZone() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE('/v1/me')),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      navigate('/login');
    },
  });
  return (
    <Card className="ring-rose-200">
      <CardTitle>Delete account</CardTitle>
      <p className="mb-4 text-sm text-slate-600">
        Permanently deletes your account and every application, reminder and AI suggestion. This
        cannot be undone.
      </p>
      <ErrorBanner error={remove.error} />
      <Button
        variant="danger"
        onClick={() => {
          if (confirm('Delete your account and all of its data permanently?')) remove.mutate();
        }}
      >
        Delete my account
      </Button>
    </Card>
  );
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ProfileCard />
          <DangerZone />
        </div>
        <ResumeCard />
      </div>
    </>
  );
}
