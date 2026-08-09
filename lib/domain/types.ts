/**
 * Core domain types for chorely.
 *
 * Everything in `lib/domain` is pure and dependency-free: no database, no
 * framework, no `Date.now()`. Callers pass in "today" explicitly. That keeps
 * scheduling and fairness logic exhaustively testable, which matters because
 * these rules are the part users will argue with.
 */

/** A calendar date in `YYYY-MM-DD` form. Compares correctly with `<`/`>`. */
export type IsoDate = string;

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * How often a chore comes back.
 *
 * The `everyNDays.from` field encodes a distinction most chore apps get wrong:
 *
 * - `'completion'` — *flexible*. The shower is due 7 days after you last
 *   cleaned it. Clean it late and the next one shifts with it.
 * - `'start'` — *fixed*. The bins go out every 7 days from a fixed anchor,
 *   whether or not you did it last week. Missing one never moves the schedule.
 */
export type Recurrence =
  | { kind: 'once' }
  | { kind: 'everyNDays'; days: number; from: 'completion' | 'start' }
  | { kind: 'weekly'; weekdays: Weekday[] }
  | { kind: 'monthly'; daysOfMonth: number[] };

/**
 * Who picks up the next occurrence.
 *
 * - `rotate` — strict round-robin through active members.
 * - `fair`   — whoever is carrying the least effort right now. Self-correcting.
 * - `fixed`  — always the same person (someone owns the plants).
 * - `anyone` — unassigned; first person to do it claims it.
 */
export type RotationMode = 'rotate' | 'fair' | 'fixed' | 'anyone';

/** Effort weighting for a chore. Scrubbing the oven is not taking out a bin. */
export const MIN_EFFORT = 1;
export const MAX_EFFORT = 5;

/** Everything the scheduler needs to place the next occurrence of one chore. */
export interface ScheduleContext {
  /** Anchor date for fixed schedules; also the earliest possible due date. */
  startOn: IsoDate;
  /** Date the chore was most recently completed, if ever. */
  lastCompletedOn?: IsoDate;
}
