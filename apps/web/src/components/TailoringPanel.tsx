import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, unwrap, type Application } from '../api/client';
import { formatDateTime } from '../lib/format';
import { Button, Card, CardTitle, ErrorBanner } from './ui';

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => unwrap(api.GET('/v1/ai/status')),
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-xs font-medium text-brand-600 hover:underline"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? 'Copied' : 'Copy all'}
    </button>
  );
}

export function TailoringPanel({ application }: { application: Application }) {
  const queryClient = useQueryClient();
  const status = useAiStatus();
  const path = { params: { path: { id: application.id } } };
  const history = useQuery({
    queryKey: ['tailorings', application.id],
    queryFn: () => unwrap(api.GET('/v1/applications/{id}/tailorings', path)),
    enabled: status.data?.available === true,
  });
  const generate = useMutation({
    mutationFn: () => unwrap(api.POST('/v1/applications/{id}/tailorings', path)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tailorings', application.id] });
      void queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  if (!status.data) return null;
  if (!status.data.available) {
    return (
      <Card>
        <CardTitle>AI resume tailoring</CardTitle>
        <p className="text-sm text-slate-500">{status.data.reason}</p>
      </Card>
    );
  }

  const latest = history.data?.[0];
  const remaining = status.data.dailyLimit - status.data.usedToday;

  return (
    <Card>
      <CardTitle
        action={
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || remaining <= 0 || !application.jobDescription}
          >
            {generate.isPending ? 'Thinking…' : latest ? 'Regenerate' : 'Tailor my resume'}
          </Button>
        }
      >
        AI resume tailoring
      </CardTitle>
      <p className="text-xs text-slate-500">
        Rewrites bullets from <Link to="/settings" className="underline">your saved resume</Link> to
        match this job description. {remaining} of {status.data.dailyLimit} requests left today.
        {!application.jobDescription && ' Add a job description to this application first.'}
      </p>
      <div className="mt-3"><ErrorBanner error={generate.error} /></div>

      {latest && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Suggested bullets</h3>
              <CopyButton text={latest.bullets.map((b) => `• ${b}`).join('\n')} />
            </div>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
              {latest.bullets.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
          {latest.missingKeywords.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">Keywords missing from your resume</h3>
              <div className="flex flex-wrap gap-1.5">
                {latest.missingKeywords.map((k) => (
                  <span key={k} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Match summary</h3>
            <p className="text-sm text-slate-700">{latest.summary}</p>
          </div>
          <p className="text-xs text-slate-400">
            Generated {formatDateTime(latest.createdAt)} · {latest.model}
            {history.data && history.data.length > 1 && ` · ${history.data.length - 1} earlier version(s) saved`}
          </p>
        </div>
      )}
    </Card>
  );
}
