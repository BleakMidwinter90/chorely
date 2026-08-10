import { describe, expect, it } from 'vitest';

import {
  awayUntilFromToday,
  daysPresentInWindow,
  describeAway,
  effectiveWeight,
  isAwayOn,
  isPeriodOver,
} from '../lib/domain/away';

const WINDOW = { start: '2024-06-01', end: '2024-06-28' }; // 28 days

describe('isAwayOn', () => {
  it('covers both ends of the period inclusively', () => {
    const period = { from: '2024-06-10', until: '2024-06-14' };
    expect(isAwayOn(period, '2024-06-09')).toBe(false);
    expect(isAwayOn(period, '2024-06-10')).toBe(true);
    expect(isAwayOn(period, '2024-06-14')).toBe(true);
    expect(isAwayOn(period, '2024-06-15')).toBe(false);
  });

  it('treats nobody as away when there is no period', () => {
    expect(isAwayOn(null, '2024-06-10')).toBe(false);
  });
});

describe('daysPresentInWindow', () => {
  it('counts the whole window when nobody is away', () => {
    expect(daysPresentInWindow(null, WINDOW)).toBe(28);
  });

  it('subtracts an away period inside the window', () => {
    // 10th to 16th inclusive is 7 days.
    expect(daysPresentInWindow({ from: '2024-06-10', until: '2024-06-16' }, WINDOW)).toBe(21);
  });

  it('clips an away period that starts before the window', () => {
    // Away from late May; only the 1st–5th falls inside.
    expect(daysPresentInWindow({ from: '2024-05-20', until: '2024-06-05' }, WINDOW)).toBe(23);
  });

  it('clips an away period that runs past the window', () => {
    expect(daysPresentInWindow({ from: '2024-06-25', until: '2024-07-10' }, WINDOW)).toBe(24);
  });

  it('ignores a period that misses the window entirely', () => {
    expect(daysPresentInWindow({ from: '2024-04-01', until: '2024-04-10' }, WINDOW)).toBe(28);
    expect(daysPresentInWindow({ from: '2024-08-01', until: '2024-08-10' }, WINDOW)).toBe(28);
  });

  it('returns zero when away for the whole window', () => {
    expect(daysPresentInWindow({ from: '2024-05-01', until: '2024-07-01' }, WINDOW)).toBe(0);
  });
});

describe('effectiveWeight', () => {
  it('leaves someone who was here the whole time untouched', () => {
    expect(effectiveWeight(1, null, WINDOW)).toBe(1);
  });

  it('halves what is expected of someone away for half the window', () => {
    // 14 days away out of 28.
    const weight = effectiveWeight(1, { from: '2024-06-01', until: '2024-06-14' }, WINDOW);
    expect(weight).toBeCloseTo(0.5, 5);
  });

  it('scales an already-reduced share proportionally', () => {
    // Someone on a half share, away for half the window, is expected to do a
    // quarter — not half, and not nothing.
    const weight = effectiveWeight(0.5, { from: '2024-06-01', until: '2024-06-14' }, WINDOW);
    expect(weight).toBeCloseTo(0.25, 5);
  });

  it('never returns zero, which would divide by zero downstream', () => {
    const weight = effectiveWeight(1, { from: '2024-05-01', until: '2024-07-01' }, WINDOW);
    expect(weight).toBeGreaterThan(0);
    expect(weight).toBeLessThan(0.05);
  });

  it('means someone away for a fortnight comes home to an even balance, not a deficit', () => {
    // The whole point. Ana was here all month and did 20 points; Ben was away
    // for half of it and did 10. That is even, and the ledger must say so.
    const anaWeight = effectiveWeight(1, null, WINDOW);
    const benWeight = effectiveWeight(1, { from: '2024-06-01', until: '2024-06-14' }, WINDOW);

    const total = 30;
    const anaExpected = (total * anaWeight) / (anaWeight + benWeight);
    const benExpected = (total * benWeight) / (anaWeight + benWeight);

    expect(anaExpected).toBeCloseTo(20, 1);
    expect(benExpected).toBeCloseTo(10, 1);
  });
});

describe('isPeriodOver', () => {
  it('is true once the last day has passed', () => {
    expect(isPeriodOver({ from: '2024-06-01', until: '2024-06-05' }, '2024-06-06')).toBe(true);
    expect(isPeriodOver({ from: '2024-06-01', until: '2024-06-05' }, '2024-06-05')).toBe(false);
    expect(isPeriodOver(null, '2024-06-06')).toBe(false);
  });
});

describe('describeAway', () => {
  it('says nothing when there is no period, or it has passed', () => {
    expect(describeAway(null, '2024-06-10')).toBeNull();
    expect(describeAway({ from: '2024-06-01', until: '2024-06-05' }, '2024-06-10')).toBeNull();
  });

  it('describes a period that has started', () => {
    expect(describeAway({ from: '2024-06-01', until: '2024-06-14' }, '2024-06-10')).toBe(
      'Away until 14 Jun',
    );
  });

  it('describes a period still to come', () => {
    expect(describeAway({ from: '2024-06-20', until: '2024-06-27' }, '2024-06-10')).toBe(
      'Away from 20 Jun to 27 Jun',
    );
  });
});

describe('awayUntilFromToday', () => {
  it('counts today as the first day away', () => {
    // "Away for 7 days" starting today ends on the 7th day, not the 8th.
    expect(awayUntilFromToday('2024-06-10', 7)).toBe('2024-06-16');
    expect(awayUntilFromToday('2024-06-10', 1)).toBe('2024-06-10');
  });

  it('treats a nonsensical length as one day', () => {
    expect(awayUntilFromToday('2024-06-10', 0)).toBe('2024-06-10');
    expect(awayUntilFromToday('2024-06-10', -5)).toBe('2024-06-10');
  });
});
