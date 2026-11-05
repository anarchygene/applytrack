import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/db/schema.js';
import {
  checkTransition,
  CLOSED_STAGES,
  createsFollowUp,
  setsAppliedDate,
} from '../../src/domain/stages.js';

describe('checkTransition', () => {
  it('refuses moving to the current stage', () => {
    expect(checkTransition('applied', 'applied')).toMatchObject({
      ok: false,
      code: 'stage_unchanged',
    });
  });

  it('allows any move between open stages, forwards and backwards', () => {
    expect(checkTransition('wishlist', 'interviewing')).toEqual({ ok: true });
    expect(checkTransition('interviewing', 'screening')).toEqual({ ok: true });
    expect(checkTransition('offer', 'rejected')).toEqual({ ok: true });
  });

  it.each([...CLOSED_STAGES])('only allows reopening %s to applied', (closed) => {
    for (const to of STAGES) {
      if (to === closed) continue;
      const result = checkTransition(closed, to);
      if (to === 'applied') expect(result).toEqual({ ok: true });
      else expect(result).toMatchObject({ ok: false, code: 'invalid_transition' });
    }
  });
});

describe('applied date and follow-up rules', () => {
  it('stamps the applied date on the first submitted stage, including skipped steps', () => {
    expect(setsAppliedDate(null, 'applied')).toBe(true);
    expect(setsAppliedDate(null, 'screening')).toBe(true);
    expect(setsAppliedDate(null, 'rejected')).toBe(true);
  });

  it('does not stamp for wishlist/withdrawn or when already set', () => {
    expect(setsAppliedDate(null, 'wishlist')).toBe(false);
    expect(setsAppliedDate(null, 'withdrawn')).toBe(false);
    expect(setsAppliedDate('2026-01-01', 'applied')).toBe(false);
  });

  it('creates a follow-up only on the first move to applied', () => {
    expect(createsFollowUp(null, 'applied')).toBe(true);
    expect(createsFollowUp(null, 'screening')).toBe(false);
    expect(createsFollowUp('2026-01-01', 'applied')).toBe(false);
  });
});
