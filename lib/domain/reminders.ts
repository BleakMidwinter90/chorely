/**
 * Deciding who to remind, and when.
 *
 * Pure and dependency-free like the rest of `lib/domain`, because the cost of
 * getting this wrong is uniquely high: a chore app that sends one notification
 * too many gets its notifications switched off, and then it may as well not
 * have them at all. Every rule here exists to stop that happening.
 */

import type { IsoDate } from './types';

export interface ReminderCandidate {
  memberId: string;
  /** Off means off. Nothing below overrides it. */
  remindersEnabled: boolean;
  /** Local hour, 0–23, at which this person has agreed to be told. */
  reminderHour: number;
  /** Date of the last reminder sent to them, if any. */
  lastRemindedOn?: IsoDate;
  /** How many chores are due today or already late for them. */
  dueCount: number;
  /** How many of those are actually overdue. */
  overdueCount: number;
}

export interface ReminderDecision {
  memberId: string;
  title: string;
  body: string;
}

/**
 * Whether one person should be sent a reminder right now.
 *
 * Four gates, all of which must pass:
 *
 * 1. They asked to be reminded.
 * 2. They have something to be reminded about. Nobody wants a notification
 *    congratulating them on an empty list.
 * 3. Their chosen hour has arrived.
 * 4. They have not already been reminded today. This is the important one — it
 *    is what makes the sender safe to call as often as you like, which in turn
 *    is what lets a self-hosted instance poll on a timer without needing a real
 *    scheduler.
 */
export function shouldRemind(candidate: ReminderCandidate, today: IsoDate, hour: number): boolean {
  if (!candidate.remindersEnabled) return false;
  if (candidate.dueCount === 0) return false;
  if (hour < candidate.reminderHour) return false;
  return candidate.lastRemindedOn !== today;
}

/**
 * The words.
 *
 * States the fact and stops. No exclamation marks, no "Don't forget!", no
 * counting how many days someone has let something slide. The app's whole
 * posture is that it reports rather than scolds, and a notification is the
 * easiest place in a product to break that promise.
 */
export function reminderMessage(candidate: ReminderCandidate): { title: string; body: string } {
  const { dueCount, overdueCount } = candidate;

  if (overdueCount > 0 && overdueCount === dueCount) {
    return {
      title: dueCount === 1 ? 'One chore is waiting' : `${dueCount} chores are waiting`,
      body: 'Still on your list from earlier.',
    };
  }

  if (overdueCount > 0) {
    return {
      title: `${dueCount} chores on your list`,
      body: `${overdueCount} of them carried over.`,
    };
  }

  return {
    title: dueCount === 1 ? 'One chore for you today' : `${dueCount} chores for you today`,
    body: 'Tap to see what they are.',
  };
}

/** Everyone who should hear from us on this pass, with the message for each. */
export function planReminders(
  candidates: readonly ReminderCandidate[],
  today: IsoDate,
  hour: number,
): ReminderDecision[] {
  return candidates
    .filter((candidate) => shouldRemind(candidate, today, hour))
    .map((candidate) => ({ memberId: candidate.memberId, ...reminderMessage(candidate) }));
}
