/**
 * Streaks, defined so they cannot become a stick.
 *
 * Streaks are the standard gamification lever in this category, and they are
 * usually implemented in a way that punishes people: miss a day and a number
 * you had been growing resets to zero, generally announced by a notification.
 * That is precisely the tone chorely exists to avoid.
 *
 * So the definition here is deliberately generous. A day counts as kept if you
 * did something **or if nothing was ever asked of you**. Being given no chores
 * on Tuesday is not a failure on your part, and an app that broke your streak
 * for it would be punishing you for its own scheduling.
 */

import { addDays, diffDays } from './date';
import type { IsoDate } from './types';

export interface StreakInput {
  /** Days on which this person completed at least one chore. */
  completedOn: readonly IsoDate[];
  /** Days on which this person had at least one chore due. */
  dueOn: readonly IsoDate[];
}

export interface Streak {
  /** Days in the run ending today (or yesterday — see below). */
  current: number;
  /** Longest run ever recorded, for context rather than comparison. */
  longest: number;
}

/**
 * What a single day contributes to a run.
 *
 * - `counts`  — work was done. The only thing that grows a streak.
 * - `bridges` — nothing was asked of them, so the run survives but does not
 *   grow. Being given no chores on Tuesday is neither an achievement nor a
 *   failure, and treating it as either would make the number lie.
 * - `breaks`  — work was due and not done.
 */
function dayKind(
  day: IsoDate,
  completed: ReadonlySet<IsoDate>,
  due: ReadonlySet<IsoDate>,
): 'counts' | 'bridges' | 'breaks' {
  if (completed.has(day)) return 'counts';
  return due.has(day) ? 'breaks' : 'bridges';
}

/**
 * Current and longest streak as of `today`.
 *
 * The current run is allowed to end yesterday rather than today. Someone
 * checking the app at nine in the morning has not yet failed at anything, and
 * showing them a zero would be both wrong and discouraging. The day only counts
 * against them once it is over.
 */
export function computeStreak(input: StreakInput, today: IsoDate): Streak {
  const completed = new Set(input.completedOn);
  const due = new Set(input.dueOn);

  // Nothing has ever happened: no streak, rather than a streak of "every day
  // since the beginning of time was quietly kept".
  if (completed.size === 0) return { current: 0, longest: 0 };

  const earliest = [...completed].sort()[0];
  const span = diffDays(today, earliest);

  let current = 0;
  // Bounded by the first day this person ever did anything. Before that there
  // is no record at all, and an unbounded walk would run backwards forever on
  // any household where nothing was due.
  for (let offset = 0; offset <= span; offset++) {
    const day = addDays(today, -offset);
    const kind = dayKind(day, completed, due);

    if (kind === 'breaks') {
      // Today being unfinished breaks nothing — the day is not over yet.
      if (offset === 0) continue;
      break;
    }
    if (kind === 'counts') current++;
  }

  let longest = 0;
  let run = 0;
  for (let offset = 0; offset <= span; offset++) {
    const kind = dayKind(addDays(earliest, offset), completed, due);
    if (kind === 'breaks') {
      run = 0;
      continue;
    }
    if (kind === 'counts') {
      run++;
      longest = Math.max(longest, run);
    }
  }

  return { current, longest: Math.max(longest, current) };
}

/**
 * A short, warm line about a streak.
 *
 * Returns null rather than inventing encouragement for someone with nothing to
 * celebrate. Silence is kinder than a participation trophy.
 */
export function describeStreak(streak: Streak): string | null {
  if (streak.current < 2) return null;
  if (streak.current >= 30) return `${streak.current} days running. Remarkable.`;
  if (streak.current >= 7) return `${streak.current} days running.`;
  return `${streak.current} days in a row.`;
}
