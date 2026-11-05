import type { AppDeps } from '../../app.js';
import type { TailoringRow } from '../../db/schema.js';
import type { AuthUser } from '../../lib/auth.js';
import { AppError } from '../../lib/errors.js';
import { getApplication } from '../applications/service.js';
import { getUser } from '../auth/service.js';
import { TailoringProviderError } from './provider.js';
import * as repo from './repository.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function toTailoringDto(row: TailoringRow) {
  return {
    id: row.id,
    applicationId: row.applicationId,
    bullets: row.bullets,
    missingKeywords: row.missingKeywords,
    summary: row.summary,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Why AI is unavailable for this user, or null if it is available. */
function unavailableReason(deps: AppDeps, user: AuthUser): string | null {
  if (!deps.tailoring) return 'AI features are not configured on this server';
  if (user.isDemo && !deps.config.AI_ALLOW_DEMO) {
    return 'AI tailoring is disabled for demo accounts; create a free account to try it';
  }
  return null;
}

export async function getStatus(deps: AppDeps, user: AuthUser) {
  const now = deps.now();
  const { used } = await repo.usageSince(deps.db, user.id, new Date(now.getTime() - WINDOW_MS));
  const reason = unavailableReason(deps, user);
  return {
    available: reason === null,
    reason,
    model: deps.tailoring?.model ?? null,
    dailyLimit: deps.config.AI_DAILY_LIMIT,
    usedToday: used,
  };
}

export async function listForApplication(deps: AppDeps, user: AuthUser, applicationId: string) {
  await getApplication(deps.db, user, applicationId);
  const rows = await repo.listTailorings(deps.db, user.id, applicationId);
  return rows.map(toTailoringDto);
}

export async function tailor(deps: AppDeps, user: AuthUser, applicationId: string) {
  const { db, config } = deps;
  const reason = unavailableReason(deps, user);
  if (reason || !deps.tailoring) throw new AppError('ai_unavailable', reason ?? 'Unavailable');

  const application = await getApplication(db, user, applicationId);
  const { resumeText } = await getUser(db, user.id);
  if (!resumeText) {
    throw new AppError('precondition_failed', 'Save your base resume before requesting tailoring');
  }
  if (!application.jobDescription) {
    throw new AppError(
      'precondition_failed',
      'Add the job description to this application before requesting tailoring',
    );
  }

  const now = deps.now();
  const usage = await repo.usageSince(db, user.id, new Date(now.getTime() - WINDOW_MS));
  if (usage.used >= config.AI_DAILY_LIMIT) {
    const resetAt = (usage.oldest?.getTime() ?? now.getTime()) + WINDOW_MS;
    throw new AppError(
      'ai_daily_limit',
      `Daily limit of ${config.AI_DAILY_LIMIT} tailoring requests reached`,
      { retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)) },
    );
  }

  let result;
  try {
    result = await deps.tailoring.tailor({
      resume: resumeText,
      jobDescription: application.jobDescription,
      company: application.company,
      role: application.role,
    });
  } catch (error) {
    if (error instanceof TailoringProviderError) {
      throw new AppError('ai_provider_error', `${error.message}; please try again later`);
    }
    throw error;
  }

  const row = await repo.insertTailoring(db, {
    userId: user.id,
    applicationId,
    bullets: result.bullets,
    missingKeywords: result.missingKeywords,
    summary: result.summary,
    model: result.model,
  });
  return toTailoringDto(row);
}
