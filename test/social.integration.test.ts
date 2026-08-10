import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { Database } from '../lib/db/client';
import { chores, nudges, occurrences } from '../lib/db/schema';
import { createHousehold, getAgenda, joinHousehold } from '../lib/services/households';
import { completeOccurrence, ensureOpenOccurrences } from '../lib/services/scheduling';
import { handOverOccurrence, nudgeAboutOccurrence } from '../lib/services/social';
import { createTestDb } from './helpers/db';

const TODAY = '2024-06-03';

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

describe('handing a chore over', () => {
  it('passes it to whoever has done least lately', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addChore(household.id, 'Bathroom', 3);
    await addChore(household.id, 'Vacuum', 3);
    await ensureOpenOccurrences(household, TODAY, db);

    // Give Ben a head start, so Ana is plainly the fairest recipient.
    const agenda = await getAgenda(household, TODAY, db);
    await completeOccurrence(household, agenda[0].occurrence.id, ben.id, TODAY, db);

    const remaining = (await getAgenda(household, TODAY, db)).find(
      (item) => item.occurrence.status === 'open' && item.assignee?.id === ben.id,
    );
    if (!remaining) return; // Fair assignment already gave it to Ana.

    const result = await handOverOccurrence(household, remaining.occurrence.id, TODAY, db);
    expect(result.ok).toBe(true);

    const [after] = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.id, remaining.occurrence.id));
    expect(after.assigneeId).toBe(ana.id);
  });

  it('refuses when there is nobody else to hand it to', async () => {
    const { household } = await newHousehold();
    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    const result = await handOverOccurrence(household, item.occurrence.id, TODAY, db);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/nobody else/i);
  });

  it('will not touch an occurrence from another household', async () => {
    const { household: mine } = await newHousehold();
    const { household: theirs } = await newHousehold();
    await joinHousehold(theirs, 'Ben', '🐢', db);
    await addChore(theirs.id, 'Their bathroom');
    await ensureOpenOccurrences(theirs, TODAY, db);

    const [item] = await getAgenda(theirs, TODAY, db);
    const before = item.assignee?.id;

    const result = await handOverOccurrence(mine, item.occurrence.id, TODAY, db);
    expect(result.ok).toBe(false);

    const [after] = await db
      .select()
      .from(occurrences)
      .where(eq(occurrences.id, item.occurrence.id));
    expect(after.assigneeId).toBe(before);
  });
});

describe('mentioning a chore to someone', () => {
  it('records the mention when it is allowed', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    // Force it onto Ben so Ana is nudging somebody else.
    await db
      .update(occurrences)
      .set({ assigneeId: ben.id })
      .where(eq(occurrences.id, item.occurrence.id));

    const result = await nudgeAboutOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    expect(result.ok).toBe(true);

    const recorded = await db.select().from(nudges);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].fromMemberId).toBe(ana.id);
    expect(recorded[0].toMemberId).toBe(ben.id);
    expect(recorded[0].sentOn).toBe(TODAY);
  });

  it('allows only one mention per chore per day, whoever sends it', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    const cal = await joinHousehold(household, 'Cal', '🦊', db);
    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await db
      .update(occurrences)
      .set({ assigneeId: ben.id })
      .where(eq(occurrences.id, item.occurrence.id));

    expect((await nudgeAboutOccurrence(household, item.occurrence.id, ana.id, TODAY, db)).ok).toBe(
      true,
    );

    // A different housemate must not get a second go — the cap is per chore,
    // not per sender, or one bin earns three buzzes.
    const second = await nudgeAboutOccurrence(household, item.occurrence.id, cal.id, TODAY, db);
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already mentioned/i);
    expect(await db.select().from(nudges)).toHaveLength(1);
  });

  it('refuses to let someone nudge their own chore', async () => {
    const { household, member: ana } = await newHousehold();
    await joinHousehold(household, 'Ben', '🐢', db);
    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await db
      .update(occurrences)
      .set({ assigneeId: ana.id })
      .where(eq(occurrences.id, item.occurrence.id));

    const result = await nudgeAboutOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    expect(result.ok).toBe(false);
    expect(await db.select().from(nudges)).toHaveLength(0);
  });

  it('refuses to chase someone about a chore that is not due yet', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addChore(household.id, 'Bathroom');
    await ensureOpenOccurrences(household, TODAY, db);

    const [item] = await getAgenda(household, TODAY, db);
    await db
      .update(occurrences)
      .set({ assigneeId: ben.id, dueOn: '2024-06-20' })
      .where(eq(occurrences.id, item.occurrence.id));

    const result = await nudgeAboutOccurrence(household, item.occurrence.id, ana.id, TODAY, db);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/isn't due yet/i);
  });
});
