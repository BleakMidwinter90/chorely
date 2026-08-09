/**
 * Scheduling: given a chore's recurrence rule and its history, when is it next
 * due? Pure functions only — the caller supplies `today`.
 */

import {
  addDays,
  addMonths,
  assertIsoDate,
  daysInMonth,
  diffDays,
  maxDate,
  startOfMonth,
  weekdayOf,
} from './date';
import type { IsoDate, Recurrence, ScheduleContext, Weekday } from './types';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Upper bound on recurrence length, so a typo can't schedule a chore for the year 4000. */
export const MAX_INTERVAL_DAYS = 365;

export function validateRecurrence(rec: Recurrence): Recurrence {
  switch (rec.kind) {
    case 'once':
      return rec;
    case 'everyNDays':
      if (!Number.isInteger(rec.days) || rec.days < 1 || rec.days > MAX_INTERVAL_DAYS) {
        throw new RangeError(`Interval must be a whole number of 1–${MAX_INTERVAL_DAYS} days`);
      }
      return rec;
    case 'weekly':
      if (rec.weekdays.length === 0) {
        throw new RangeError('Pick at least one day of the week');
      }
      if (rec.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new RangeError('Weekdays must be 0 (Sunday) through 6 (Saturday)');
      }
      return rec;
    case 'monthly':
      if (rec.daysOfMonth.length === 0) {
        throw new RangeError('Pick at least one day of the month');
      }
      if (rec.daysOfMonth.some((d) => !Number.isInteger(d) || d < 1 || d > 31)) {
        throw new RangeError('Days of the month must be between 1 and 31');
      }
      return rec;
  }
}

/**
 * The next date this chore should be due, or `null` if it is finished forever
 * (a one-off that has been done).
 *
 * The rule for repeating chores is that the next occurrence always lands
 * strictly after the last completion — doing a chore twice in one day must not
 * leave it still showing as due.
 */
export function nextDueDate(rec: Recurrence, ctx: ScheduleContext): IsoDate | null {
  validateRecurrence(rec);
  const startOn = assertIsoDate(ctx.startOn);
  const lastCompletedOn = ctx.lastCompletedOn ? assertIsoDate(ctx.lastCompletedOn) : undefined;

  // The earliest date the next occurrence may fall on.
  const earliest = lastCompletedOn ? maxDate(addDays(lastCompletedOn, 1), startOn) : startOn;

  switch (rec.kind) {
    case 'once':
      return lastCompletedOn ? null : startOn;

    case 'everyNDays': {
      if (rec.from === 'completion') {
        // Flexible: the clock restarts when the work is actually done.
        return lastCompletedOn ? addDays(lastCompletedOn, rec.days) : startOn;
      }
      // Fixed: stay locked to the original cadence regardless of when it got done.
      const elapsed = diffDays(earliest, startOn);
      if (elapsed <= 0) return startOn;
      return addDays(startOn, Math.ceil(elapsed / rec.days) * rec.days);
    }

    case 'weekly': {
      const wanted = new Set<Weekday>(rec.weekdays);
      for (let offset = 0; offset < 7; offset++) {
        const candidate = addDays(earliest, offset);
        if (wanted.has(weekdayOf(candidate))) return candidate;
      }
      /* c8 ignore next -- unreachable: a non-empty weekday set always hits within 7 days */
      throw new Error('Unable to resolve a weekly due date');
    }

    case 'monthly': {
      // Two months of lookahead is always enough: clamping guarantees every
      // month contains at least one candidate day.
      for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
        const month = addMonths(startOfMonth(earliest), monthOffset);
        const lastDay = daysInMonth(month);
        const candidates = rec.daysOfMonth
          // "The 31st" in a 30-day month means the 30th, not "skip this month".
          .map((day) => Math.min(day, lastDay))
          .sort((a, b) => a - b)
          .map((day) => `${month.slice(0, 7)}-${String(day).padStart(2, '0')}`);
        const hit = candidates.find((candidate) => candidate >= earliest);
        if (hit) return hit;
      }
      /* c8 ignore next -- unreachable given the clamping above */
      throw new Error('Unable to resolve a monthly due date');
    }
  }
}

export type DueStatus = 'overdue' | 'today' | 'upcoming';

export function dueStatus(dueOn: IsoDate, today: IsoDate): DueStatus {
  if (dueOn < today) return 'overdue';
  if (dueOn === today) return 'today';
  return 'upcoming';
}

/** How many days late a chore is. Zero when it is due today or later. */
export function daysOverdue(dueOn: IsoDate, today: IsoDate): number {
  return Math.max(0, diffDays(today, dueOn));
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Plain-English summary of a rule, for UI and for tests to assert against. */
export function describeRecurrence(rec: Recurrence): string {
  switch (rec.kind) {
    case 'once':
      return 'One time only';

    case 'everyNDays': {
      const every =
        rec.days === 1
          ? 'Every day'
          : rec.days === 7
            ? 'Every week'
            : rec.days === 14
              ? 'Every 2 weeks'
              : `Every ${rec.days} days`;
      return rec.from === 'completion' ? `${every} after it's done` : every;
    }

    case 'weekly': {
      const days = [...new Set(rec.weekdays)].sort((a, b) => a - b);
      if (days.length === 7) return 'Every day';
      if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return 'Every weekday';
      if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Every weekend';
      if (days.length === 1) return `Every ${WEEKDAY_NAMES[days[0]]}`;
      return `Every ${joinWords(days.map((d) => WEEKDAY_SHORT[d]))}`;
    }

    case 'monthly': {
      const days = [...new Set(rec.daysOfMonth)].sort((a, b) => a - b);
      return `Monthly on the ${joinWords(days.map(ordinal))}`;
    }
  }
}
