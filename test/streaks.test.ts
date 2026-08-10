import { describe, expect, it } from 'vitest';

import { computeStreak, describeStreak } from '../lib/domain/streaks';

const TODAY = '2024-06-10';

describe('computeStreak', () => {
  it('is zero for someone who has never done anything', () => {
    expect(computeStreak({ completedOn: [], dueOn: ['2024-06-08'] }, TODAY)).toEqual({
      current: 0,
      longest: 0,
    });
  });

  it('counts consecutive days of work', () => {
    const streak = computeStreak(
      { completedOn: ['2024-06-08', '2024-06-09', '2024-06-10'], dueOn: [] },
      TODAY,
    );
    expect(streak.current).toBe(3);
  });

  it('does not punish someone for a day the app gave them nothing to do', () => {
    // Worked Saturday and Monday; had nothing assigned on Sunday. That gap is
    // the schedule's doing, not theirs, so the run survives it.
    const streak = computeStreak(
      {
        completedOn: ['2024-06-08', '2024-06-10'],
        dueOn: ['2024-06-08', '2024-06-10'],
      },
      TODAY,
    );
    // Two days of work, bridged rather than padded: an empty day keeps a run
    // alive but must not inflate it, or "3 days in a row" would be a lie.
    expect(streak.current).toBe(2);
  });

  it('breaks the run on a day work was due and skipped', () => {
    const streak = computeStreak(
      {
        completedOn: ['2024-06-07', '2024-06-09', '2024-06-10'],
        dueOn: ['2024-06-07', '2024-06-08', '2024-06-09', '2024-06-10'],
      },
      TODAY,
    );
    // 9th and 10th only — the 8th was due and missed.
    expect(streak.current).toBe(2);
  });

  it('does not count today against someone before the day is over', () => {
    // Chores are due today and not yet done. At 9am that is not a failure.
    const streak = computeStreak(
      {
        completedOn: ['2024-06-08', '2024-06-09'],
        dueOn: ['2024-06-08', '2024-06-09', '2024-06-10'],
      },
      TODAY,
    );
    expect(streak.current).toBe(2);
  });

  it('never inflates a run with days that had nothing due', () => {
    // One chore done forty days ago and nothing asked for since. Those forty
    // empty days bridge the run rather than padding it, so this is a streak of
    // one - the single day of actual work - and emphatically not forty-one.
    const streak = computeStreak({ completedOn: ['2024-05-01'], dueOn: [] }, TODAY);
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it('counts only days of real work, however long the quiet stretch', () => {
    // Bridging must connect, never accumulate.
    const streak = computeStreak(
      { completedOn: ['2024-06-01', '2024-06-10'], dueOn: ['2024-06-01', '2024-06-10'] },
      TODAY,
    );
    expect(streak.current).toBe(2);
  });

  it('remembers the longest run even after it ends', () => {
    const streak = computeStreak(
      {
        completedOn: [
          '2024-06-01',
          '2024-06-02',
          '2024-06-03',
          '2024-06-04',
          // gap: the 5th was due and missed
          '2024-06-09',
          '2024-06-10',
        ],
        dueOn: [
          '2024-06-01',
          '2024-06-02',
          '2024-06-03',
          '2024-06-04',
          '2024-06-05',
          '2024-06-09',
          '2024-06-10',
        ],
      },
      TODAY,
    );
    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(4);
  });

  it('never reports a longest shorter than the current run', () => {
    const streak = computeStreak(
      { completedOn: ['2024-06-09', '2024-06-10'], dueOn: ['2024-06-09', '2024-06-10'] },
      TODAY,
    );
    expect(streak.longest).toBeGreaterThanOrEqual(streak.current);
  });

  it('handles a single day of work', () => {
    const streak = computeStreak({ completedOn: [TODAY], dueOn: [TODAY] }, TODAY);
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
  });

  it('crosses a month boundary', () => {
    const streak = computeStreak(
      { completedOn: ['2024-05-31', '2024-06-01'], dueOn: ['2024-05-31', '2024-06-01'] },
      '2024-06-01',
    );
    expect(streak.current).toBe(2);
  });
});

describe('describeStreak', () => {
  it('says nothing about a streak too short to be worth mentioning', () => {
    expect(describeStreak({ current: 0, longest: 0 })).toBeNull();
    expect(describeStreak({ current: 1, longest: 5 })).toBeNull();
  });

  it('is warm without being breathless', () => {
    expect(describeStreak({ current: 3, longest: 3 })).toBe('3 days in a row.');
    expect(describeStreak({ current: 9, longest: 9 })).toBe('9 days running.');
    expect(describeStreak({ current: 31, longest: 31 })).toBe('31 days running. Remarkable.');
  });

  it('never guilts, and never mentions losing anything', () => {
    for (const current of [2, 5, 10, 40]) {
      const text = describeStreak({ current, longest: current })!;
      expect(text).not.toMatch(/!|lost|broke|don't|keep it up|streak/i);
    }
  });
});
