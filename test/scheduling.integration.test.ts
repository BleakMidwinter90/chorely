/**
 * Service-layer tests against a real SQLite database.
 *
 * `lib/domain` proves the rules are right in isolation; these prove they are
 * wired up right — that the queries feed the rules the state they expect and
 * write the answer back where the next read will find it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../lib/db/client';
import { chores, members, occurrences } from '../lib/db/schema';
import { addDays } from '../lib/domain/date';
import {
  archiveChore,
  createChore,
  createHousehold,
  getAgenda,
  joinHousehold,
  listChores,
} from '../lib/services/households';
import { getHouseholdBalance, getRecentActivity } from '../lib/services/ledger';
import { completeOccurrence, ensureOpenOccurrences, skipOccurrence } from '../lib/services/scheduling';
import { createTestDb } from './helpers/db';

const TODAY = '2024-06-03'; // a Monday

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function newHousehold(options: { withStarterChores?: boolean } = {}) {
  return createHousehold(
    {
      householdName: 'Flat 3B',
      memberName: 'Ana',
      timezone: 'UTC',
      today: TODAY,
      withStarterChores: options.withStarterChores ?? false,
    },
    db,
  );
}

async function addWeeklyChore(householdId: string, name: string, effort = 2) {
  const [chore] = await db
    .insert(chores)
    .values({
      id: `ch_${name.replace(/\W/g, '')}`,
      householdId,
      name,
      icon: '🧹',
      effort,
      recurrence: { kind: 'everyNDays', days: 7, from: 'completion' },
      rotationMode: 'fair',
      startOn: TODAY,
    })
    .returning();
  return chore;
}

describe('creating a household', () => {
  it('creates the household with its first member and a shareable join code', async () => {
    const { household, member } = await newHousehold();

    expect(household.name).toBe('Flat 3B');
    expect(household.joinCode).toMatch(/^[a-z0-9]{14}$/);
    expect(member.name).toBe('Ana');
    expect(member.weight).toBe(1);
    expect(member.sortOrder).toBe(0);
  });

  it('seeds starter chores so the app is not empty on first open', async () => {
    const { household } = await newHousehold({ withStarterChores: true });

    const seeded = await listChores(household.id, db);
    expect(seeded.length).toBeGreaterThan(5);
    expect(seeded.map((c) => c.name)).toContain('Take out the bins');

    // And each one already has something scheduled against it.
    const agenda = await getAgenda(household, TODAY, db);
    expect(agenda.length).toBe(seeded.length);
  });

  it('gives every join code a distinct value', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { household } = await newHousehold();
      codes.add(household.joinCode);
    }
    expect(codes.size).toBe(20);
  });
});

describe('joining a household', () => {
  it('appends members in join order', async () => {
    const { household } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    const cal = await joinHousehold(household, 'Cal', '🦊', db);

    expect(ben.sortOrder).toBe(1);
    expect(cal.sortOrder).toBe(2);
    expect(cal.emoji).toBe('🦊');
  });

  it('redistributes unstarted work when someone new arrives', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await addWeeklyChore(household.id, 'Vacuum');
    await ensureOpenOccurrences(household, TODAY, db);

    // Ana is alone, so both chores land on her.
    let agenda = await getAgenda(household, TODAY, db);
    expect(agenda.every((item) => item.assignee?.id === ana.id)).toBe(true);

    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    // With two people and nothing done yet, the work splits.
    agenda = await getAgenda(household, TODAY, db);
    const assignees = new Set(agenda.map((item) => item.assignee?.id));
    expect(assignees).toEqual(new Set([ana.id, ben.id]));
  });

  it('never reassigns work that is already finished', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    await joinHousehold(household, 'Ben', '🐢', db);

    const done = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.status, 'done'));
    expect(done).toHaveLength(1);
    expect(done[0].completedById).toBe(ana.id);
  });
});

describe('ensureOpenOccurrences', () => {
  it('is idempotent — one open occurrence per chore however often it runs', async () => {
    const { household } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');

    expect(await ensureOpenOccurrences(household, TODAY, db)).toBe(1);
    expect(await ensureOpenOccurrences(household, TODAY, db)).toBe(0);
    expect(await ensureOpenOccurrences(household, TODAY, db)).toBe(0);

    const open = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.status, 'open'));
    expect(open).toHaveLength(1);
  });

  it('ignores archived chores', async () => {
    const { household } = await newHousehold();
    const chore = await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    await archiveChore(household, chore.id, db);

    expect(await ensureOpenOccurrences(household, TODAY, db)).toBe(0);
    const agenda = await getAgenda(household, TODAY, db);
    expect(agenda).toHaveLength(0);
  });

  it('leaves a completed one-off alone forever', async () => {
    const { household, member: ana } = await newHousehold();
    await db.insert(chores).values({
      id: 'ch_once',
      householdId: household.id,
      name: 'Assemble the shelf',
      icon: '🔧',
      effort: 5,
      recurrence: { kind: 'once' },
      rotationMode: 'fair',
      startOn: TODAY,
    });

    await ensureOpenOccurrences(household, TODAY, db);
    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    expect(await getAgenda(household, '2024-07-01', db)).toHaveLength(0);
  });
});

describe('completing a chore', () => {
  it('records who did it and schedules the next one', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom', 4);
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    const [completed] = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.id, item.occurrence.id));
    expect(completed.status).toBe('done');
    expect(completed.completedById).toBe(ana.id);
    expect(completed.resolvedOn).toBe(TODAY);
    expect(completed.effortAwarded).toBe(4);

    // A flexible weekly chore comes back 7 days after it was actually done.
    const agenda = await getAgenda(household, TODAY, db);
    expect(agenda).toHaveLength(1);
    expect(agenda[0].occurrence.dueOn).toBe('2024-06-10');
  });

  it('credits whoever actually did the work, not whoever it was assigned to', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    const assignee = item.assignee!.id;
    const other = assignee === ana.id ? ben.id : ana.id;

    // Someone does a chore that was not their turn — a kindness the ledger
    // should credit to them.
    await completeOccurrence(household, item.occurrence.id, other, TODAY, db);

    const [completed] = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.id, item.occurrence.id));
    expect(completed.assigneeId).toBe(assignee);
    expect(completed.completedById).toBe(other);
  });

  it('freezes the effort value, so re-pricing a chore cannot rewrite history', async () => {
    const { household, member: ana } = await newHousehold();
    const chore = await addWeeklyChore(household.id, 'Bathroom', 5);
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    // The household later decides the bathroom is only worth 1 point.
    await db.update(chores).set({ effort: 1 }).where(eq(chores.id, chore.id));

    const balance = await getHouseholdBalance(household, TODAY, db);
    expect(balance.report.totalPoints).toBe(5);
  });

  it('is safe to double-tap', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    const done = await db.select().from(occurrences).where(eq(occurrences.status, 'done'));
    expect(done).toHaveLength(1);
  });

  it('refuses an occurrence belonging to another household', async () => {
    const { household: mine } = await newHousehold();
    const { household: theirs, member: theirMember } = await newHousehold();
    await addWeeklyChore(theirs.id, 'Their bathroom');
    await ensureOpenOccurrences(theirs, TODAY, db);
    const [theirItem] = await getAgenda(theirs, TODAY, db);

    await expect(
      completeOccurrence(mine, theirItem.occurrence.id, theirMember.id, TODAY, db),
    ).rejects.toThrow(/not found/i);
  });
});

describe('skipping a chore', () => {
  it('clears it without crediting anyone, and reschedules', async () => {
    const { household } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await skipOccurrence(household, item.occurrence.id, TODAY, db);

    const balance = await getHouseholdBalance(household, TODAY, db);
    expect(balance.report.totalPoints).toBe(0);

    // Rescheduled rather than left rotting in the overdue pile.
    const agenda = await getAgenda(household, TODAY, db);
    expect(agenda).toHaveLength(1);
    expect(agenda[0].occurrence.dueOn).toBe('2024-06-10');
  });

  it('keeps skipped work out of the activity feed', async () => {
    const { household } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await skipOccurrence(household, item.occurrence.id, TODAY, db);

    expect(await getRecentActivity(household, 30, db)).toHaveLength(0);
  });
});

describe('the fairness ledger', () => {
  it('starts perfectly balanced and stays that way when work is shared', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addWeeklyChore(household.id, 'Bathroom', 2);
    await addWeeklyChore(household.id, 'Vacuum', 2);
    await ensureOpenOccurrences(household, TODAY, db);

    const agenda = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, agenda[0].occurrence.id, ana.id, TODAY, db);
    await completeOccurrence(household, agenda[1].occurrence.id, ben.id, TODAY, db);

    const balance = await getHouseholdBalance(household, TODAY, db);
    expect(balance.report.totalPoints).toBe(4);
    expect(balance.report.balance).toBe(100);
  });

  it('shows the imbalance when one person does everything', async () => {
    const { household, member: ana } = await newHousehold();
    await joinHousehold(household, 'Ben', '🐢', db);
    await addWeeklyChore(household.id, 'Bathroom', 3);
    await addWeeklyChore(household.id, 'Vacuum', 3);
    await ensureOpenOccurrences(household, TODAY, db);

    for (const item of await getAgenda(household, TODAY, db)) {
      await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    }

    const balance = await getHouseholdBalance(household, TODAY, db);
    expect(balance.report.balance).toBe(0);
    expect(balance.report.members[0].memberId).toBe(ana.id);
    expect(balance.nameOf(ana.id)).toBe('Ana');
  });

  it('forgets work that has aged out of the window', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom', 3);
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);

    // Default window is 28 days.
    expect((await getHouseholdBalance(household, '2024-06-30', db)).report.totalPoints).toBe(3);
    expect((await getHouseholdBalance(household, '2024-07-05', db)).report.totalPoints).toBe(0);
  });

  it('lists recent completions newest first, as receipts for the score', async () => {
    const { household, member: ana } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom', 3);
    await addWeeklyChore(household.id, 'Vacuum', 1);
    await ensureOpenOccurrences(household, TODAY, db);

    for (const item of await getAgenda(household, TODAY, db)) {
      await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    }

    const activity = await getRecentActivity(household, 30, db);
    expect(activity).toHaveLength(2);
    expect(activity.every((entry) => entry.member?.name === 'Ana')).toBe(true);
    expect(activity.map((entry) => entry.effort).sort()).toEqual([1, 3]);
  });
});

describe('fair rotation over time', () => {
  it('evens the load out across a household without anyone managing it', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    const cal = await joinHousehold(household, 'Cal', '🦊', db);

    for (const name of ['Bathroom', 'Vacuum', 'Dishes', 'Laundry']) {
      await addWeeklyChore(household.id, name, 2);
    }

    // Everyone always does whatever they are assigned, for four weeks.
    let today = TODAY;
    for (let week = 0; week < 4; week++) {
      for (const item of await getAgenda(household, today, db)) {
        if (item.occurrence.dueOn > today) continue;
        await completeOccurrence(household, item.occurrence.id, item.assignee!.id, today, db);
      }
      today = addDays(today, 7);
    }

    const balance = await getHouseholdBalance(household, today, db);
    expect(balance.report.totalPoints).toBeGreaterThan(0);
    // Nobody drifts more than one chore away from their share.
    for (const load of balance.report.members) {
      expect(Math.abs(load.delta)).toBeLessThanOrEqual(2);
    }
    expect([ana.id, ben.id, cal.id].every((id) =>
      balance.report.members.some((m) => m.memberId === id),
    )).toBe(true);
  });

  it('honours an agreed uneven split', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    // Ben is away half the month; the household agreed he does half as much.
    await db.update(members).set({ weight: 0.5 }).where(eq(members.id, ben.id));

    for (const name of ['Bathroom', 'Vacuum', 'Dishes']) {
      await addWeeklyChore(household.id, name, 2);
    }
    await ensureOpenOccurrences(household, TODAY, db);

    const agenda = await getAgenda(household, TODAY, db);
    const anaShare = agenda.filter((item) => item.assignee?.id === ana.id).length;
    const benShare = agenda.filter((item) => item.assignee?.id === ben.id).length;

    expect(anaShare).toBeGreaterThan(benShare);
  });
});

describe('archiving a chore', () => {
  it('removes it from the agenda but keeps its history in the ledger', async () => {
    const { household, member: ana } = await newHousehold();
    const chore = await addWeeklyChore(household.id, 'Bathroom', 3);
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    await archiveChore(household, chore.id, db);

    expect(await getAgenda(household, TODAY, db)).toHaveLength(0);
    // The work still counts — deleting it would rewrite who pulled their weight.
    expect((await getHouseholdBalance(household, TODAY, db)).report.totalPoints).toBe(3);
  });
});

describe('creating a chore through the service', () => {
  it('schedules it immediately and respects a fixed owner', async () => {
    const { household } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    await createChore(
      household,
      {
        name: 'Water the plants',
        icon: '🪴',
        effort: 1,
        recurrence: { kind: 'weekly', weekdays: [3] },
        rotationMode: 'fixed',
        fixedMemberId: ben.id,
      },
      TODAY,
      db,
    );

    const agenda = await getAgenda(household, TODAY, db);
    const plants = agenda.find((item) => item.chore.name === 'Water the plants');
    expect(plants).toBeDefined();
    expect(plants!.assignee?.id).toBe(ben.id);
    expect(plants!.occurrence.dueOn).toBe('2024-06-05'); // the coming Wednesday
  });

  it('leaves an "anyone" chore unassigned', async () => {
    const { household } = await newHousehold();
    await createChore(
      household,
      {
        name: 'Water the plants',
        icon: '🪴',
        effort: 1,
        recurrence: { kind: 'once' },
        rotationMode: 'anyone',
      },
      TODAY,
      db,
    );

    const [item] = await getAgenda(household, TODAY, db);
    expect(item.assignee).toBeNull();
  });
});

describe('overdue work', () => {
  it('marks past-due chores and sorts them to the top', async () => {
    const { household } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const later = '2024-06-20';
    const agenda = await getAgenda(household, later, db);
    expect(agenda[0].status).toBe('overdue');
  });

  it('does not stack up missed occurrences into a wall of guilt', async () => {
    const { household } = await newHousehold();
    await addWeeklyChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    // Two months of neglect still leaves exactly one thing to do.
    const agenda = await getAgenda(household, '2024-08-01', db);
    expect(agenda).toHaveLength(1);
  });
});

describe('household isolation', () => {
  it('never leaks chores between households', async () => {
    const { household: a } = await newHousehold();
    const { household: b } = await newHousehold();
    await addWeeklyChore(a.id, 'A bathroom');
    await addWeeklyChore(b.id, 'B bathroom');
    await ensureOpenOccurrences(a, TODAY, db);
    await ensureOpenOccurrences(b, TODAY, db);

    const agendaA = await getAgenda(a, TODAY, db);
    expect(agendaA).toHaveLength(1);
    expect(agendaA[0].chore.name).toBe('A bathroom');

    const rowsForA = await db
      .select()
      .from(occurrences)
      .where(and(eq(occurrences.householdId, a.id), eq(occurrences.status, 'open')));
    expect(rowsForA).toHaveLength(1);
  });
});
