/**
 * Away mode: pausing someone while they are not there.
 *
 * The obvious half is easy — do not assign chores to someone on holiday. The
 * half that matters is the fairness ledger. If a housemate is away for two
 * weeks of a four-week window and their expected share is untouched, they come
 * home to an app telling them they are behind, which is both false and exactly
 * the accusation this project exists not to make.
 *
 * So being away scales what is expected of you, in proportion to the days you
 * were actually there.
 */

import { addDays, diffDays, maxDate } from './date';
import type { IsoDate } from './types';

export interface AwayPeriod {
  /** Inclusive first day away. */
  from: IsoDate;
  /** Inclusive last day away. */
  until: IsoDate;
}

export function isAwayOn(period: AwayPeriod | null, day: IsoDate): boolean {
  if (!period) return false;
  return day >= period.from && day <= period.until;
}

/**
 * Days present within `[start, end]`, given an away period.
 *
 * Both ends inclusive, so a single-day window with nobody away is 1 rather
 * than 0.
 */
export function daysPresentInWindow(
  period: AwayPeriod | null,
  window: { start: IsoDate; end: IsoDate },
): number {
  const total = diffDays(window.end, window.start) + 1;
  if (total <= 0) return 0;
  if (!period) return total;

  // The part of the away period that actually overlaps the window.
  const overlapStart = maxDate(period.from, window.start);
  const overlapEnd = period.until < window.end ? period.until : window.end;
  const overlap = diffDays(overlapEnd, overlapStart) + 1;

  if (overlap <= 0) return total;
  return Math.max(0, total - overlap);
}

/**
 * The share to expect from someone, given how much of the window they were here
 * for.
 *
 * Returns a weight, not a percentage: it is fed straight into the existing
 * fairness maths, which already understands members having different weights.
 * That means away mode needs no changes at all to the scoring itself.
 *
 * Never returns exactly zero for someone who was present at all — a weight of
 * zero would divide by zero downstream. Someone away for the entire window is
 * given a floor instead, and since they will have done nothing, the honest
 * outcome is that they barely register either way.
 */
export function effectiveWeight(
  baseWeight: number,
  period: AwayPeriod | null,
  window: { start: IsoDate; end: IsoDate },
): number {
  const total = diffDays(window.end, window.start) + 1;
  if (total <= 0) return baseWeight;

  const present = daysPresentInWindow(period, window);
  const scaled = baseWeight * (present / total);

  // A floor rather than zero, so the weighted maths stays defined.
  return Math.max(scaled, 0.01);
}

/** Whether an away period has finished, so it can be cleared. */
export function isPeriodOver(period: AwayPeriod | null, today: IsoDate): boolean {
  return Boolean(period) && period!.until < today;
}

/** Plain-English summary, for the settings screen. */
export function describeAway(period: AwayPeriod | null, today: IsoDate): string | null {
  if (!period) return null;
  if (period.until < today) return null;

  const format = (day: IsoDate) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${day}T00:00:00Z`));

  if (period.from > today) return `Away from ${format(period.from)} to ${format(period.until)}`;
  return `Away until ${format(period.until)}`;
}

/** The last day of an away period starting today and lasting `days` days. */
export function awayUntilFromToday(today: IsoDate, days: number): IsoDate {
  return addDays(today, Math.max(1, days) - 1);
}
