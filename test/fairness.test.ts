import { describe, expect, it } from 'vitest';

import {
  balanceScore,
  computeBalance,
  describeBalance,
  type FairnessCompletion,
  type FairnessMember,
} from '../lib/domain/fairness';

const WINDOW = { start: '2024-06-01', end: '2024-06-28' };

function members(...specs: Array<[string, number?]>): FairnessMember[] {
  return specs.map(([memberId, weight = 1]) => ({ memberId, weight }));
}

function done(memberId: string, effort: number, completedOn = '2024-06-10'): FairnessCompletion {
  return { memberId, effort, completedOn };
}

describe('balanceScore', () => {
  it('is 100 for a perfectly even split', () => {
    expect(balanceScore([5, 5], [5, 5])).toBe(100);
    expect(balanceScore([4, 4, 4], [4, 4, 4])).toBe(100);
  });

  it('is 0 when one person did absolutely everything', () => {
    expect(balanceScore([10, 0], [5, 5])).toBe(0);
    expect(balanceScore([10, 0, 0], [10 / 3, 10 / 3, 10 / 3])).toBe(0);
    expect(balanceScore([0, 0, 0, 12], [3, 3, 3, 3])).toBe(0);
  });

  it('normalises against household size, so scores compare across households', () => {
    // A 60/40 split scores the same whether or not the household is bigger.
    expect(balanceScore([6, 4], [5, 5])).toBe(80);
    // Without worst-case normalisation, "one of two people did everything"
    // would score 50 while "one of six did everything" scored ~83.
    expect(balanceScore([10, 0], [5, 5])).toBe(balanceScore([10, 0, 0, 0, 0, 0], Array(6).fill(10 / 6)));
  });

  it('treats an empty ledger as nothing to argue about', () => {
    expect(balanceScore([0, 0], [0, 0])).toBe(100);
    expect(balanceScore([], [])).toBe(100);
  });

  it('is 100 for a single-member household', () => {
    expect(balanceScore([42], [42])).toBe(100);
  });

  it('penalises the under-contributor more than the over-contributor when shares differ', () => {
    // Weights 2:1 — expected [8, 4] out of 12.
    // The person who agreed to do more doing everything is less unfair than
    // the person who agreed to do less doing everything.
    expect(balanceScore([12, 0], [8, 4])).toBe(50);
    expect(balanceScore([0, 12], [8, 4])).toBe(0);
  });
});

describe('computeBalance', () => {
  it('sums effort per member and compares it to their agreed share', () => {
    const report = computeBalance(
      members(['ana'], ['ben']),
      [done('ana', 3), done('ana', 2), done('ben', 5)],
      WINDOW,
    );

    expect(report.totalPoints).toBe(10);
    expect(report.balance).toBe(100);
    expect(report.members).toHaveLength(2);
    for (const load of report.members) {
      expect(load.points).toBe(5);
      expect(load.expected).toBe(5);
      expect(load.delta).toBe(0);
      expect(load.sharePct).toBe(50);
      expect(load.targetPct).toBe(50);
    }
  });

  it('sorts by who is carrying the most', () => {
    const report = computeBalance(
      members(['ana'], ['ben'], ['cal']),
      [done('ben', 8), done('ana', 4), done('cal', 0)],
      WINDOW,
    );

    expect(report.members.map((m) => m.memberId)).toEqual(['ben', 'ana', 'cal']);
    expect(report.members[0].delta).toBe(4);
    expect(report.members[2].delta).toBe(-4);
  });

  it('respects agreed weights rather than assuming an equal split', () => {
    // Ben travels half the month and the household agreed he does half as much.
    const report = computeBalance(
      members(['ana', 2], ['ben', 1]),
      [done('ana', 8), done('ben', 4)],
      WINDOW,
    );

    expect(report.balance).toBe(100);
    expect(report.members.find((m) => m.memberId === 'ana')?.targetPct).toBeCloseTo(66.7, 1);
    expect(report.members.find((m) => m.memberId === 'ben')?.targetPct).toBeCloseTo(33.3, 1);
  });

  it('ignores completions outside the window', () => {
    const report = computeBalance(
      members(['ana'], ['ben']),
      [
        done('ana', 5, '2024-05-31'), // before
        done('ana', 5, '2024-06-29'), // after
        done('ana', 5, '2024-06-01'), // first day, inclusive
        done('ben', 5, '2024-06-28'), // last day, inclusive
      ],
      WINDOW,
    );

    expect(report.totalPoints).toBe(10);
    expect(report.balance).toBe(100);
  });

  it('ignores work logged by people who have left the household', () => {
    const report = computeBalance(members(['ana'], ['ben']), [done('ana', 5), done('zoe', 99)], WINDOW);

    expect(report.totalPoints).toBe(5);
    expect(report.members.map((m) => m.memberId).sort()).toEqual(['ana', 'ben']);
  });

  it('reports an empty ledger without dividing by zero', () => {
    const report = computeBalance(members(['ana'], ['ben']), [], WINDOW);

    expect(report.totalPoints).toBe(0);
    expect(report.balance).toBe(100);
    expect(report.members.every((m) => m.sharePct === 0 && m.expected === 0)).toBe(true);
  });

  it('handles a household of one', () => {
    const report = computeBalance(members(['ana']), [done('ana', 7)], WINDOW);

    expect(report.balance).toBe(100);
    expect(report.members[0].sharePct).toBe(100);
  });

  it('rejects non-positive weights instead of producing Infinity', () => {
    expect(() => computeBalance(members(['ana', 0], ['ben']), [], WINDOW)).toThrow(RangeError);
    expect(() => computeBalance(members(['ana', -1], ['ben']), [], WINDOW)).toThrow(RangeError);
  });

  it('echoes the window back for display', () => {
    const report = computeBalance(members(['ana']), [], WINDOW);
    expect(report.windowStart).toBe(WINDOW.start);
    expect(report.windowEnd).toBe(WINDOW.end);
  });
});

describe('describeBalance', () => {
  const nameOf = (id: string) => id.toUpperCase();

  it('says nothing accusatory when there is no data', () => {
    expect(describeBalance(computeBalance(members(['ana'], ['ben']), [], WINDOW), nameOf)).toMatch(
      /No chores logged/,
    );
  });

  it('recognises a household of one', () => {
    expect(describeBalance(computeBalance(members(['ana']), [done('ana', 3)], WINDOW), nameOf)).toBe(
      'Doing it all yourself.',
    );
  });

  it('praises an even split', () => {
    const report = computeBalance(members(['ana'], ['ben']), [done('ana', 5), done('ben', 5)], WINDOW);
    expect(describeBalance(report, nameOf)).toBe('Evenly split. Nice.');
  });

  it('softens a mild imbalance', () => {
    const report = computeBalance(members(['ana'], ['ben']), [done('ana', 6), done('ben', 4)], WINDOW);
    expect(describeBalance(report, nameOf)).toBe('Fairly even, with ANA a little ahead.');
  });

  it('names the imbalance plainly when it is large, without blaming', () => {
    const report = computeBalance(members(['ana'], ['ben']), [done('ana', 9), done('ben', 1)], WINDOW);
    const text = describeBalance(report, nameOf);
    expect(text).toContain('ANA');
    expect(text).toContain('BEN');
    expect(text).not.toMatch(/lazy|fault|should/i);
  });
});
