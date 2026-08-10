/**
 * Fairness scoring — the reason this app exists.
 *
 * Households rarely argue about schedules. They argue about who is pulling
 * their weight, usually from memory, usually badly. This module turns that
 * argument into a number both sides can look at.
 */

import type { IsoDate } from './types';

/** Default window for "recently". Long enough to survive one busy week. */
export const DEFAULT_WINDOW_DAYS = 28;

export interface FairnessMember {
  memberId: string;
  /**
   * Agreed share of the household's work, relative to the others.
   *
   * Equal weights mean an equal split. A housemate who is away half the month,
   * works nights, or has agreed to do less can carry `0.5` — the point is that
   * "fair" is whatever the household says it is, declared up front rather than
   * relitigated every week.
   */
  weight: number;
}

export interface FairnessCompletion {
  memberId: string;
  /** Effort points the chore was worth when it was done. */
  effort: number;
  completedOn: IsoDate;
}

export interface MemberLoad {
  memberId: string;
  /** Effort points actually done inside the window. */
  points: number;
  /** Points this member would have done under a perfectly weighted split. */
  expected: number;
  /** `points - expected`. Positive means carrying more than their share. */
  delta: number;
  /** Share of the household's total effort, 0–100. */
  sharePct: number;
  /** Share this member agreed to, 0–100. */
  targetPct: number;
}

export interface BalanceReport {
  windowStart: IsoDate;
  windowEnd: IsoDate;
  totalPoints: number;
  /**
   * 0–100, where 100 is a perfectly weighted split and 0 means one person did
   * literally everything. See {@link balanceScore}.
   */
  balance: number;
  /** Sorted by `delta` descending: whoever is carrying the most comes first. */
  members: MemberLoad[];
}

/**
 * Normalised fairness index.
 *
 * Total deviation from the ideal split, divided by the worst deviation
 * *possible* for this household, inverted onto 0–100. Normalising against the
 * worst case is what makes the number comparable between a couple and a
 * six-person share house: "one person did everything" scores 0 in both, where
 * a raw deviation measure would score the couple 50.
 *
 * With one member — or with no work logged — there is nothing to be unfair
 * about, so the score is 100.
 */
export function balanceScore(points: number[], expected: number[]): number {
  const total = points.reduce((sum, p) => sum + p, 0);
  if (total <= 0 || points.length < 2) return 100;

  const deviation = points.reduce((sum, p, i) => sum + Math.abs(p - expected[i]), 0);
  // Worst case: every point is done by whoever was expected to do the least.
  const worst = 2 * (total - Math.min(...expected));
  if (worst <= 0) return 100;

  return clampPercent(100 * (1 - deviation / worst));
}

/**
 * Effort each member has done in the window against what they signed up for.
 *
 * Completions outside `[windowStart, windowEnd]`, and completions by anyone not
 * in `members` (someone who has since left the household), are ignored.
 */
export function computeBalance(
  members: readonly FairnessMember[],
  completions: readonly FairnessCompletion[],
  window: { start: IsoDate; end: IsoDate },
): BalanceReport {
  if (members.some((m) => !(m.weight > 0))) {
    throw new RangeError('Member weights must be greater than zero');
  }

  const pointsByMember = new Map(members.map((m) => [m.memberId, 0]));
  for (const completion of completions) {
    if (completion.completedOn < window.start || completion.completedOn > window.end) continue;
    const current = pointsByMember.get(completion.memberId);
    if (current === undefined) continue;
    pointsByMember.set(completion.memberId, current + completion.effort);
  }

  const totalPoints = [...pointsByMember.values()].reduce((sum, p) => sum + p, 0);
  const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);

  const points = members.map((m) => pointsByMember.get(m.memberId) ?? 0);
  const expected = members.map((m) => (totalPoints * m.weight) / totalWeight);

  const loads: MemberLoad[] = members.map((member, i) => ({
    memberId: member.memberId,
    points: points[i],
    expected: expected[i],
    delta: points[i] - expected[i],
    sharePct: totalPoints > 0 ? (100 * points[i]) / totalPoints : 0,
    targetPct: (100 * member.weight) / totalWeight,
  }));

  loads.sort((a, b) => b.delta - a.delta || a.memberId.localeCompare(b.memberId));

  return {
    windowStart: window.start,
    windowEnd: window.end,
    totalPoints,
    balance: balanceScore(points, expected),
    members: loads,
  };
}

/**
 * A short, deliberately non-accusatory summary of a balance report.
 *
 * Tone is a product decision here. The app should never be a weapon in a
 * domestic argument, so the copy names imbalance without naming a villain.
 */
export function describeBalance(
  report: BalanceReport,
  nameOf: (memberId: string) => string,
): string {
  if (report.totalPoints === 0) return 'No chores logged yet this month.';
  if (report.members.length < 2) return 'Doing it all yourself.';
  if (report.balance >= 90) return 'Evenly split. Nice.';

  const most = report.members[0];
  const least = report.members[report.members.length - 1];
  if (report.balance >= 70) {
    return `Fairly even, with ${nameOf(most.memberId)} a little ahead.`;
  }
  return `${nameOf(most.memberId)} is carrying more than their share, and ${nameOf(least.memberId)} is behind.`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
