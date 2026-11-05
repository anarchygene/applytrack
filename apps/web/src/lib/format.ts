import type { Source, Stage, WorkMode } from '../api/client';

export const STAGES: Stage[] = [
  'wishlist',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
  'withdrawn',
];
export const OPEN_STAGES: Stage[] = ['wishlist', 'applied', 'screening', 'interviewing', 'offer'];
export const CLOSED_STAGES: Stage[] = ['accepted', 'rejected', 'withdrawn'];

export const STAGE_LABEL: Record<Stage, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const STAGE_STYLE: Record<Stage, string> = {
  wishlist: 'bg-slate-100 text-slate-700 ring-slate-200',
  applied: 'bg-sky-50 text-sky-800 ring-sky-200',
  screening: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  interviewing: 'bg-violet-50 text-violet-800 ring-violet-200',
  offer: 'bg-amber-50 text-amber-800 ring-amber-200',
  accepted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 ring-rose-200',
  withdrawn: 'bg-stone-100 text-stone-600 ring-stone-200',
};

export const SOURCES: Source[] = [
  'linkedin',
  'company_site',
  'job_board',
  'referral',
  'recruiter',
  'career_fair',
  'other',
];

export const SOURCE_LABEL: Record<Source | 'unknown', string> = {
  linkedin: 'LinkedIn',
  company_site: 'Company site',
  job_board: 'Job board',
  referral: 'Referral',
  recruiter: 'Recruiter',
  career_fair: 'Career fair',
  other: 'Other',
  unknown: 'Unknown',
};

export const WORK_MODES: WorkMode[] = ['onsite', 'hybrid', 'remote'];
export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

/** Mirrors the API rule so the UI only offers moves the server will accept. */
export function allowedMoves(from: Stage): Stage[] {
  if (CLOSED_STAGES.includes(from)) return ['applied'];
  return STAGES.filter((s) => s !== from);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatSalary(min: number | null, max: number | null, currency: string): string {
  if (min == null && max == null) return '—';
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return min != null ? `from ${fmt(min)}` : `up to ${fmt(max!)}`;
}

export const formatPercent = (ratio: number | null) =>
  ratio === null ? '—' : `${Math.round(ratio * 100)}%`;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
