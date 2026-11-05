import type { Stage } from '../db/schema.js';

/** Terminal stages: the only allowed move out of them is reopening to `applied`. */
export const CLOSED_STAGES: ReadonlySet<Stage> = new Set(['accepted', 'rejected', 'withdrawn']);

/** Stages that imply the application was submitted (everything except wishlist and withdrawn). */
export const SUBMITTED_STAGES: ReadonlySet<Stage> = new Set([
  'applied',
  'screening',
  'interviewing',
  'offer',
  'accepted',
  'rejected',
]);

/** Reaching any of these counts as the employer responding. */
export const RESPONSE_STAGES: readonly Stage[] = ['screening', 'interviewing', 'offer', 'accepted'];

/** Reaching any of these counts as an offer. */
export const OFFER_STAGES: readonly Stage[] = ['offer', 'accepted'];

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: 'stage_unchanged' | 'invalid_transition'; reason: string };

export function checkTransition(from: Stage, to: Stage): TransitionResult {
  if (from === to) {
    return { ok: false, code: 'stage_unchanged', reason: `Application is already in "${to}"` };
  }
  if (CLOSED_STAGES.has(from) && to !== 'applied') {
    return {
      ok: false,
      code: 'invalid_transition',
      reason: `"${from}" is a closed stage; reopen it by moving to "applied" first`,
    };
  }
  return { ok: true };
}

/**
 * Whether entering `to` should stamp the applied date. True the first time an application
 * reaches a submitted stage, including when the user skips straight past "applied".
 */
export function setsAppliedDate(currentAppliedOn: string | null, to: Stage): boolean {
  return currentAppliedOn === null && SUBMITTED_STAGES.has(to);
}

/** The automatic follow-up is created only when the application is stamped as applied. */
export const FOLLOW_UP_DAYS = 7;
export const FOLLOW_UP_TITLE = 'Follow up on application';

export function createsFollowUp(currentAppliedOn: string | null, to: Stage): boolean {
  return currentAppliedOn === null && to === 'applied';
}
