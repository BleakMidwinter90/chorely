import { describe, expect, it } from 'vitest';

import {
  planReminders,
  reminderMessage,
  shouldRemind,
  type ReminderCandidate,
} from '../lib/domain/reminders';

const TODAY = '2024-06-03';

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    memberId: 'mb_ana',
    remindersEnabled: true,
    reminderHour: 9,
    dueCount: 2,
    overdueCount: 0,
    ...overrides,
  };
}

describe('shouldRemind', () => {
  it('sends once the chosen hour has arrived and there is something to say', () => {
    expect(shouldRemind(candidate(), TODAY, 9)).toBe(true);
    expect(shouldRemind(candidate(), TODAY, 18)).toBe(true);
  });

  it('stays quiet before the chosen hour', () => {
    expect(shouldRemind(candidate({ reminderHour: 9 }), TODAY, 8)).toBe(false);
    expect(shouldRemind(candidate({ reminderHour: 20 }), TODAY, 19)).toBe(false);
  });

  it('respects the off switch absolutely', () => {
    expect(shouldRemind(candidate({ remindersEnabled: false }), TODAY, 12)).toBe(false);
    // Even with overdue work, which is exactly when a lesser app would nag.
    expect(
      shouldRemind(
        candidate({ remindersEnabled: false, dueCount: 9, overdueCount: 9 }),
        TODAY,
        12,
      ),
    ).toBe(false);
  });

  it('never sends a notification about an empty list', () => {
    expect(shouldRemind(candidate({ dueCount: 0 }), TODAY, 12)).toBe(false);
  });

  it('sends at most one reminder a day', () => {
    expect(shouldRemind(candidate({ lastRemindedOn: TODAY }), TODAY, 12)).toBe(false);
    expect(shouldRemind(candidate({ lastRemindedOn: '2024-06-02' }), TODAY, 12)).toBe(true);
  });

  it('is therefore safe to call repeatedly — the property the scheduler relies on', () => {
    // A self-hosted instance polls on a timer rather than running real cron, so
    // the same decision gets evaluated many times an hour. Only the first pass
    // may fire; the daily gate is what makes the rest harmless.
    const person = candidate();
    expect(shouldRemind(person, TODAY, 10)).toBe(true);

    const afterSending = { ...person, lastRemindedOn: TODAY };
    for (const hour of [10, 11, 12, 18, 23]) {
      expect(shouldRemind(afterSending, TODAY, hour)).toBe(false);
    }
  });
});

describe('reminderMessage', () => {
  it('counts correctly, in singular and plural', () => {
    expect(reminderMessage(candidate({ dueCount: 1 })).title).toBe('One chore for you today');
    expect(reminderMessage(candidate({ dueCount: 4 })).title).toBe('4 chores for you today');
  });

  it('mentions carried-over work without dwelling on it', () => {
    const mixed = reminderMessage(candidate({ dueCount: 3, overdueCount: 1 }));
    expect(mixed.title).toBe('3 chores on your list');
    expect(mixed.body).toBe('1 of them carried over.');

    const allLate = reminderMessage(candidate({ dueCount: 2, overdueCount: 2 }));
    expect(allLate.title).toBe('2 chores are waiting');
  });

  it('never scolds, guilts, or counts the days', () => {
    const messages = [
      reminderMessage(candidate({ dueCount: 1 })),
      reminderMessage(candidate({ dueCount: 5, overdueCount: 5 })),
      reminderMessage(candidate({ dueCount: 9, overdueCount: 2 })),
    ];

    for (const { title, body } of messages) {
      const text = `${title} ${body}`;
      expect(text).not.toMatch(/!|don't forget|still haven't|overdue|late|behind|lazy|should/i);
    }
  });
});

describe('planReminders', () => {
  it('returns only the people who are due one, each with their own message', () => {
    const plan = planReminders(
      [
        candidate({ memberId: 'ana', dueCount: 1 }),
        candidate({ memberId: 'ben', remindersEnabled: false }),
        candidate({ memberId: 'cal', dueCount: 0 }),
        candidate({ memberId: 'dee', reminderHour: 22 }),
        candidate({ memberId: 'eve', lastRemindedOn: TODAY }),
      ],
      TODAY,
      10,
    );

    expect(plan.map((entry) => entry.memberId)).toEqual(['ana']);
    expect(plan[0].title).toBe('One chore for you today');
  });

  it('returns nothing when nobody qualifies', () => {
    expect(planReminders([candidate({ dueCount: 0 })], TODAY, 10)).toEqual([]);
    expect(planReminders([], TODAY, 10)).toEqual([]);
  });

  it('lets each person choose their own hour', () => {
    const people = [
      candidate({ memberId: 'early', reminderHour: 7 }),
      candidate({ memberId: 'late', reminderHour: 20 }),
    ];

    expect(planReminders(people, TODAY, 8).map((p) => p.memberId)).toEqual(['early']);
    expect(planReminders(people, TODAY, 21).map((p) => p.memberId)).toEqual(['early', 'late']);
  });
});
