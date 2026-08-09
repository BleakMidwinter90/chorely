import { describe, expect, it } from 'vitest';

import {
  daysOverdue,
  describeRecurrence,
  dueStatus,
  nextDueDate,
  validateRecurrence,
} from '../lib/domain/recurrence';
import type { Recurrence } from '../lib/domain/types';

describe('validateRecurrence', () => {
  it('rejects nonsensical intervals', () => {
    const bad = (r: Recurrence) => () => validateRecurrence(r);
    expect(bad({ kind: 'everyNDays', days: 0, from: 'start' })).toThrow(RangeError);
    expect(bad({ kind: 'everyNDays', days: -3, from: 'start' })).toThrow(RangeError);
    expect(bad({ kind: 'everyNDays', days: 1.5, from: 'start' })).toThrow(RangeError);
    expect(bad({ kind: 'everyNDays', days: 400, from: 'start' })).toThrow(/365/);
  });

  it('rejects empty or out-of-range day sets', () => {
    expect(() => validateRecurrence({ kind: 'weekly', weekdays: [] })).toThrow(/at least one/);
    expect(() => validateRecurrence({ kind: 'monthly', daysOfMonth: [] })).toThrow(/at least one/);
    // @ts-expect-error deliberately out of range for a runtime check
    expect(() => validateRecurrence({ kind: 'weekly', weekdays: [7] })).toThrow(RangeError);
    expect(() => validateRecurrence({ kind: 'monthly', daysOfMonth: [0] })).toThrow(RangeError);
    expect(() => validateRecurrence({ kind: 'monthly', daysOfMonth: [32] })).toThrow(RangeError);
  });

  it('accepts valid rules', () => {
    const rec: Recurrence = { kind: 'weekly', weekdays: [1, 4] };
    expect(validateRecurrence(rec)).toBe(rec);
    expect(validateRecurrence({ kind: 'once' })).toEqual({ kind: 'once' });
  });
});

describe('nextDueDate — one-off chores', () => {
  const rec: Recurrence = { kind: 'once' };

  it('is due on its start date until it is done', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01' })).toBe('2024-06-01');
  });

  it('never comes back once completed', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-03' })).toBeNull();
  });
});

describe('nextDueDate — flexible intervals (from completion)', () => {
  const rec: Recurrence = { kind: 'everyNDays', days: 7, from: 'completion' };

  it('starts on the start date', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01' })).toBe('2024-06-01');
  });

  it('restarts the clock from when the work was actually done', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-05' })).toBe(
      '2024-06-12',
    );
  });

  it('drifts with late completions — that is the point', () => {
    // Done 9 days late; the next one moves with it rather than being instantly overdue.
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-10' })).toBe(
      '2024-06-17',
    );
  });

  it('handles a daily flexible chore', () => {
    const daily: Recurrence = { kind: 'everyNDays', days: 1, from: 'completion' };
    expect(nextDueDate(daily, { startOn: '2024-06-01', lastCompletedOn: '2024-06-01' })).toBe(
      '2024-06-02',
    );
  });
});

describe('nextDueDate — fixed intervals (from start)', () => {
  const rec: Recurrence = { kind: 'everyNDays', days: 7, from: 'start' };

  it('starts on the start date', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01' })).toBe('2024-06-01');
  });

  it('stays locked to the original cadence when done on time', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-01' })).toBe(
      '2024-06-08',
    );
  });

  it('does not drift when done late — the bins still go out on schedule', () => {
    // Completed 3 days late, but the cadence is unchanged.
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-04' })).toBe(
      '2024-06-08',
    );
  });

  it('skips missed occurrences entirely rather than piling them up', () => {
    // Nothing done for a month: it is due at the next scheduled slot, not
    // four times over.
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-07-02' })).toBe(
      '2024-07-06',
    );
  });

  it('lands exactly on the cadence when completed the day before a slot', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-07' })).toBe(
      '2024-06-08',
    );
  });

  it('ignores completions recorded before the chore started', () => {
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-05-01' })).toBe(
      '2024-06-01',
    );
  });
});

describe('nextDueDate — weekly', () => {
  // 2024-06-01 is a Saturday.
  const monThu: Recurrence = { kind: 'weekly', weekdays: [1, 4] };

  it('finds the first matching weekday on or after the start', () => {
    expect(nextDueDate(monThu, { startOn: '2024-06-01' })).toBe('2024-06-03'); // Monday
  });

  it('is due the same day when the start date already matches', () => {
    expect(nextDueDate(monThu, { startOn: '2024-06-03' })).toBe('2024-06-03');
  });

  it('moves to the next listed day after completion', () => {
    expect(nextDueDate(monThu, { startOn: '2024-06-01', lastCompletedOn: '2024-06-03' })).toBe(
      '2024-06-06',
    ); // Thursday
    expect(nextDueDate(monThu, { startOn: '2024-06-01', lastCompletedOn: '2024-06-06' })).toBe(
      '2024-06-10',
    ); // following Monday
  });

  it('wraps across the week and the year', () => {
    const sundays: Recurrence = { kind: 'weekly', weekdays: [0] };
    expect(nextDueDate(sundays, { startOn: '2024-12-30', lastCompletedOn: '2024-12-30' })).toBe(
      '2025-01-05',
    );
  });

  it('never returns the completion date itself', () => {
    const daily: Recurrence = { kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] };
    expect(nextDueDate(daily, { startOn: '2024-06-01', lastCompletedOn: '2024-06-05' })).toBe(
      '2024-06-06',
    );
  });
});

describe('nextDueDate — monthly', () => {
  it('finds the next listed day of the month', () => {
    const rec: Recurrence = { kind: 'monthly', daysOfMonth: [1, 15] };
    expect(nextDueDate(rec, { startOn: '2024-06-05' })).toBe('2024-06-15');
    expect(nextDueDate(rec, { startOn: '2024-06-05', lastCompletedOn: '2024-06-15' })).toBe(
      '2024-07-01',
    );
  });

  it('clamps a day the month does not have instead of skipping the month', () => {
    const rec: Recurrence = { kind: 'monthly', daysOfMonth: [31] };
    expect(nextDueDate(rec, { startOn: '2024-02-01' })).toBe('2024-02-29'); // leap year
    expect(nextDueDate(rec, { startOn: '2023-02-01' })).toBe('2023-02-28');
    expect(nextDueDate(rec, { startOn: '2024-04-01' })).toBe('2024-04-30');
    expect(nextDueDate(rec, { startOn: '2024-05-01' })).toBe('2024-05-31');
  });

  it('rolls into the next month when every listed day has passed', () => {
    const rec: Recurrence = { kind: 'monthly', daysOfMonth: [5] };
    expect(nextDueDate(rec, { startOn: '2024-06-01', lastCompletedOn: '2024-06-05' })).toBe(
      '2024-07-05',
    );
  });

  it('crosses the year boundary', () => {
    const rec: Recurrence = { kind: 'monthly', daysOfMonth: [10] };
    expect(nextDueDate(rec, { startOn: '2024-12-01', lastCompletedOn: '2024-12-10' })).toBe(
      '2025-01-10',
    );
  });

  it('handles unsorted input days', () => {
    const rec: Recurrence = { kind: 'monthly', daysOfMonth: [20, 5] };
    expect(nextDueDate(rec, { startOn: '2024-06-01' })).toBe('2024-06-05');
  });
});

describe('dueStatus and daysOverdue', () => {
  it('classifies relative to today', () => {
    expect(dueStatus('2024-06-01', '2024-06-02')).toBe('overdue');
    expect(dueStatus('2024-06-02', '2024-06-02')).toBe('today');
    expect(dueStatus('2024-06-03', '2024-06-02')).toBe('upcoming');
  });

  it('counts only days actually late', () => {
    expect(daysOverdue('2024-06-01', '2024-06-04')).toBe(3);
    expect(daysOverdue('2024-06-04', '2024-06-04')).toBe(0);
    expect(daysOverdue('2024-06-10', '2024-06-04')).toBe(0);
  });
});

describe('describeRecurrence', () => {
  it('describes intervals in words people use', () => {
    expect(describeRecurrence({ kind: 'once' })).toBe('One time only');
    expect(describeRecurrence({ kind: 'everyNDays', days: 1, from: 'start' })).toBe('Every day');
    expect(describeRecurrence({ kind: 'everyNDays', days: 7, from: 'start' })).toBe('Every week');
    expect(describeRecurrence({ kind: 'everyNDays', days: 14, from: 'start' })).toBe(
      'Every 2 weeks',
    );
    expect(describeRecurrence({ kind: 'everyNDays', days: 3, from: 'start' })).toBe('Every 3 days');
  });

  it('marks flexible intervals as relative to completion', () => {
    expect(describeRecurrence({ kind: 'everyNDays', days: 7, from: 'completion' })).toBe(
      "Every week after it's done",
    );
  });

  it('collapses common weekday sets into natural phrases', () => {
    expect(describeRecurrence({ kind: 'weekly', weekdays: [1] })).toBe('Every Monday');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5] })).toBe('Every weekday');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [0, 6] })).toBe('Every weekend');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      'Every day',
    );
    expect(describeRecurrence({ kind: 'weekly', weekdays: [4, 1] })).toBe('Every Mon and Thu');
    expect(describeRecurrence({ kind: 'weekly', weekdays: [1, 3, 5] })).toBe(
      'Every Mon, Wed and Fri',
    );
  });

  it('uses ordinals for monthly rules', () => {
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [1] })).toBe('Monthly on the 1st');
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [2] })).toBe('Monthly on the 2nd');
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [3] })).toBe('Monthly on the 3rd');
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [4] })).toBe('Monthly on the 4th');
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [11] })).toBe('Monthly on the 11th');
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [21, 1] })).toBe(
      'Monthly on the 1st and 21st',
    );
    expect(describeRecurrence({ kind: 'monthly', daysOfMonth: [1, 11, 22] })).toBe(
      'Monthly on the 1st, 11th and 22nd',
    );
  });
});
