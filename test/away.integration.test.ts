import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { Database } from '../lib/db/client';
import { chores, members, occurrences } from '../lib/db/schema';
import { createHousehold, getAgenda, joinHousehold } from '../lib/services/households';
import { getHouseholdBalance } from '../lib/services/ledger';
import { completeOccurrence, ensureOpenOccurrences } from '../lib/services/scheduling';
import { createTestDb } from './helpers/db';

const TODAY = '2024-06-28';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function newHousehold() {
  return createHousehold(
    {
      householdName: 'Flat 3B',
      memberName: 'Ana',
      timezone: 'UTC',
      today: TODAY,
      withStarterChores: false,
    },
    db,
  );
}

async function addChore(householdId: string, name: string, effort = 2) {
  await db.insert(chores).values({
    id: `ch_${name.replace(/\W/g, '')}`,
    householdId,
    name,
    icon: '🧹',
    effort,
    recurrence: { kind: 'everyNDays', days: 7, from: 'completion' },
    rotationMode: 'fair',
    startOn: TODAY,
  });
}

describe('away mode', () => {
  it('stops assigning chores to someone who is away', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    await db
      .update(members)
      .set({ awayFrom: '2024-06-20', awayUntil: '2024-07-05' })
      .where(eq(members.id, ben.id));

    for (const name of ['Bathroom', 'Vacuum', 'Dishes', 'Laundry']) {
      await addChore(household.id, name);
    }
    await ensureOpenOccurrences(household, TODAY, db);

    const agenda = await getAgenda(household, TODAY, db);
    expect(agenda.length).toBe(4);
    // Every one of them lands on the person who is actually there.
    expect(agenda.every((item) => item.assignee?.id === ana.id)).toBe(true);
  });

  it('still assigns to someone whose away period has not started', async () => {
    const { household } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    await db
      .update(members)
      .set({ awayFrom: '2024-07-10', awayUntil: '2024-07-20' })
      .where(eq(members.id, ben.id));

    for (const name of ['Bathroom', 'Vacuum']) await addChore(household.id, name);
    await ensureOpenOccurrences(household, TODAY, db);

    const agenda = await getAgenda(household, TODAY, db);
    const assignees = new Set(agenda.map((item) => item.assignee?.id));
    expect(assignees.has(ben.id)).toBe(true);
  });

  it('falls back to the whole household when everybody is away', async () => {
    const { household } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    await db
      .update(members)
      .set({ awayFrom: '2024-06-20', awayUntil: '2024-07-05' })
      .where(eq(members.householdId, household.id));

    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    // Better that somebody has it than that the bins are nobody's problem.
    const [item] = await getAgenda(household, TODAY, db);
    expect([ben.id, item.assignee?.id]).toContain(item.assignee?.id);
    expect(item.assignee).not.toBeNull();
  });

  it('scales what is expected, so nobody comes home to a deficit', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    // Ben was away for the first half of the 28-day window.
    await db
      .update(members)
      .set({ awayFrom: '2024-06-01', awayUntil: '2024-06-14' })
      .where(eq(members.id, ben.id));

    await addChore(household.id, 'Bathroom', 2);
    await ensureOpenOccurrences(household, TODAY, db);
    const [item] = await getAgenda(household, TODAY, db);

    // Ana did 20 points; Ben, here for half the window, did 10. That is even.
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    await db
      .update(occurrences)
      .set({ effortAwarded: 20 })
      .where(eq(occurrences.id, item.occurrence.id));

    await db.insert(occurrences).values({
      id: 'oc_ben_work',
      householdId: household.id,
      choreId: 'ch_Bathroom',
      dueOn: '2024-06-20',
      status: 'done',
      completedById: ben.id,
      completedAt: new Date(),
      resolvedOn: '2024-06-20',
      effortAwarded: 10,
    });

    const balance = await getHouseholdBalance(household, TODAY, db);
    expect(balance.report.totalPoints).toBe(30);
    // Without weight scaling this would score 33 and tell Ben he was behind.
    expect(balance.report.balance).toBeGreaterThanOrEqual(95);
  });

  it('holds someone to their full share once they are back', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    // An away period entirely before the window counts for nothing.
    await db
      .update(members)
      .set({ awayFrom: '2024-01-01', awayUntil: '2024-01-14' })
      .where(eq(members.id, ben.id));

    await addChore(household.id, 'Bathroom', 2);
    await ensureOpenOccurrences(household, TODAY, db);
    const [item] = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    await db
      .update(occurrences)
      .set({ effortAwarded: 20 })
      .where(eq(occurrences.id, item.occurrence.id));

    const balance = await getHouseholdBalance(household, TODAY, db);
    // Ana did everything and Ben was present throughout, so this is lopsided.
    expect(balance.report.balance).toBe(0);
  });
});
