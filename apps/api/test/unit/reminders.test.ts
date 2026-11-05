import { describe, expect, it } from 'vitest';
import { addDays, dateIn, daysBetween, isoWeekStart, isValidTimeZone } from '../../src/domain/dates.js';
import { groupReminders } from '../../src/domain/reminders.js';

describe('groupReminders', () => {
  const today = '2026-11-05';
  const r = (id: string, dueOn: string, completedAt: string | null = null) => ({
    id,
    dueOn,
    completedAt,
  });

  it('splits incomplete reminders into overdue, today and upcoming', () => {
    const groups = groupReminders(
      [r('a', '2026-11-01'), r('b', '2026-11-05'), r('c', '2026-11-06'), r('d', '2026-11-04')],
      today,
    );
    expect(groups.overdue.map((x) => x.id)).toEqual(['a', 'd']);
    expect(groups.dueToday.map((x) => x.id)).toEqual(['b']);
    expect(groups.upcoming.map((x) => x.id)).toEqual(['c']);
    expect(groups.completed).toEqual([]);
  });

  it('puts completed reminders in their own group regardless of due date', () => {
    const groups = groupReminders([r('a', '2026-11-01', '2026-11-02T00:00:00Z')], today);
    expect(groups.completed.map((x) => x.id)).toEqual(['a']);
    expect(groups.overdue).toEqual([]);
  });
});

describe('date helpers', () => {
  it('evaluates "today" in the user time zone', () => {
    // 2026-11-05 20:00 UTC is already 2026-11-06 in Singapore (UTC+8) but not in New York.
    const instant = new Date('2026-11-05T20:00:00Z');
    expect(dateIn(instant, 'Asia/Singapore')).toBe('2026-11-06');
    expect(dateIn(instant, 'America/New_York')).toBe('2026-11-05');
  });

  it('does calendar arithmetic across month and year boundaries', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(daysBetween('2026-10-30', '2026-11-06')).toBe(7);
  });

  it('finds the Monday of the ISO week', () => {
    expect(isoWeekStart('2026-11-05')).toBe('2026-11-02'); // Thursday → Monday
    expect(isoWeekStart('2026-11-08')).toBe('2026-11-02'); // Sunday → previous Monday
    expect(isoWeekStart('2026-11-02')).toBe('2026-11-02');
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Asia/Singapore')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
