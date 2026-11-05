import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { api, ApiError, unwrap } from '../api/client';
import { useMe, useSignedIn } from '../auth';
import { Logo } from '../components/Layout';
import { Button, ErrorBanner, Field, Input } from '../components/ui';

const FEATURES = [
  ['Pipeline board', 'Move applications from wishlist to offer and keep a dated timeline of every step.'],
  ['Never miss a follow-up', 'Automatic reminders 7 days after you apply, plus your own to-dos.'],
  ['Know what works', 'Response and offer rates by source, and your weekly application pace.'],
  ['AI resume tailoring', 'Rewrite your resume bullets for a specific job post (when enabled).'],
];

export function LoginPage() {
  const { data: user } = useMe();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/applications';

  const done = (result: { user: Parameters<typeof signedIn>[0] }) => {
    signedIn(result.user);
    navigate(from, { replace: true });
  };

  const submit = useMutation({
    mutationFn: () =>
      mode === 'login'
        ? unwrap(api.POST('/v1/auth/login', { body: { email: form.email, password: form.password } }))
        : unwrap(
            api.POST('/v1/auth/register', {
              body: {
                ...form,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            }),
          ),
    onSuccess: done,
  });
  const demo = useMutation({ mutationFn: () => unwrap(api.POST('/v1/auth/demo')), onSuccess: done });

  if (user) return <Navigate to={from} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };
  const err = submit.error instanceof ApiError ? submit.error : null;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-indigo-900 p-12 text-white lg:flex">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg ring-2 ring-white/30" />
          ApplyTrack
        </span>
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Run your job search like a pipeline.</h1>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(([title, text]) => (
              <li key={title}>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-indigo-100">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-indigo-200">
          Built with Fastify, PostgreSQL and React ·{' '}
          <a className="underline" href="/docs" target="_blank" rel="noreferrer">
            API reference
          </a>
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {mode === 'login' ? 'Sign in' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <button
              type="button"
              className="font-medium text-brand-600 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                submit.reset();
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === 'register' && (
              <Field label="Name" error={err?.fieldError('name')}>
                <Input
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
            )}
            <Field label="Email" error={err?.fieldError('email')}>
              <Input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field
              label="Password"
              error={err?.fieldError('password')}
              hint={mode === 'register' ? 'At least 10 characters' : undefined}
            >
              <Input
                type="password"
                required
                minLength={mode === 'register' ? 10 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {submit.error && !err?.problem.errors && <ErrorBanner error={submit.error} />}
            <Button type="submit" className="w-full" disabled={submit.isPending}>
              {submit.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
          </div>
          <Button variant="secondary" className="w-full" disabled={demo.isPending} onClick={() => demo.mutate()}>
            {demo.isPending ? 'Preparing your demo…' : 'Try the demo — no sign-up'}
          </Button>
          <p className="mt-2 text-center text-xs text-slate-500">
            A private sandbox with sample data, deleted after 24 hours.
          </p>
          {demo.error && <div className="mt-3"><ErrorBanner error={demo.error} /></div>}
        </div>
      </div>
    </div>
  );
}
