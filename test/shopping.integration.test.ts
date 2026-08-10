import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import type { Database } from '../lib/db/client';
import { shoppingItems } from '../lib/db/schema';
import { createHousehold, joinHousehold } from '../lib/services/households';
import {
  addShoppingItem,
  clearBoughtItems,
  countNeeded,
  getShoppingList,
  pruneOldBoughtItems,
  removeShoppingItem,
  setItemBought,
} from '../lib/services/shopping';
import { createTestDb } from './helpers/db';

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
      today: '2024-06-03',
      withStarterChores: false,
    },
    db,
  );
}

describe('the shared shopping list', () => {
  it('adds items and reports them as needed', async () => {
    const { household, member: ana } = await newHousehold();

    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);
    await addShoppingItem(household, { name: 'Bread', note: 'sourdough', addedById: ana.id }, db);

    const list = await getShoppingList(household, db);
    expect(list.needed.map((entry) => entry.item.name)).toEqual(['Milk', 'Bread']);
    expect(list.bought).toHaveLength(0);
    expect(list.needed[1].item.note).toBe('sourdough');
    expect(list.needed[0].addedBy?.name).toBe('Ana');
  });

  it('trims whitespace and treats an empty note as no note', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: '  Milk  ', note: '   ', addedById: ana.id }, db);

    const [entry] = (await getShoppingList(household, db)).needed;
    expect(entry.item.name).toBe('Milk');
    expect(entry.item.note).toBeNull();
  });

  it('moves an item to the trolley and records who picked it up', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);

    const [entry] = (await getShoppingList(household, db)).needed;
    await setItemBought(household, entry.item.id, true, ben.id, db);

    const list = await getShoppingList(household, db);
    expect(list.needed).toHaveLength(0);
    expect(list.bought).toHaveLength(1);
    // Whoever added it and whoever bought it are tracked separately, because
    // they are usually different people.
    expect(list.bought[0].addedBy?.name).toBe('Ana');
    expect(list.bought[0].boughtBy?.name).toBe('Ben');
  });

  it('puts an item back when someone unticks it', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);

    const [entry] = (await getShoppingList(household, db)).needed;
    await setItemBought(household, entry.item.id, true, ana.id, db);
    await setItemBought(household, entry.item.id, false, ana.id, db);

    const list = await getShoppingList(household, db);
    expect(list.needed).toHaveLength(1);
    expect(list.bought).toHaveLength(0);
    // The stale buyer must be cleared, or the row claims Ana bought something
    // that is back on the list.
    expect(list.needed[0].item.boughtById).toBeNull();
    expect(list.needed[0].item.boughtAt).toBeNull();
  });

  it('removes an item outright', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);

    const [entry] = (await getShoppingList(household, db)).needed;
    await removeShoppingItem(household, entry.item.id, db);

    expect((await getShoppingList(household, db)).needed).toHaveLength(0);
  });

  it('clears the trolley without touching what is still needed', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);
    await addShoppingItem(household, { name: 'Bread', addedById: ana.id }, db);

    const list = await getShoppingList(household, db);
    await setItemBought(household, list.needed[0].item.id, true, ana.id, db);
    await clearBoughtItems(household, db);

    const after = await getShoppingList(household, db);
    expect(after.bought).toHaveLength(0);
    expect(after.needed.map((entry) => entry.item.name)).toEqual(['Bread']);
  });

  it('prunes items bought over a week ago, and keeps recent ones', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: 'Old', addedById: ana.id }, db);
    await addShoppingItem(household, { name: 'Recent', addedById: ana.id }, db);

    const list = await getShoppingList(household, db);
    for (const entry of list.needed) {
      await setItemBought(household, entry.item.id, true, ana.id, db);
    }

    // Backdate one purchase beyond the week-long window.
    const longAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db
      .update(shoppingItems)
      .set({ boughtAt: longAgo })
      .where(eq(shoppingItems.id, list.needed[0].item.id));

    await pruneOldBoughtItems(household, db);

    const after = await getShoppingList(household, db);
    expect(after.bought.map((entry) => entry.item.name)).toEqual(['Recent']);
  });

  it('never prunes something that is still needed, however old', async () => {
    const { household, member: ana } = await newHousehold();
    await addShoppingItem(household, { name: 'Lightbulbs', addedById: ana.id }, db);

    await db
      .update(shoppingItems)
      .set({ createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) })
      .where(eq(shoppingItems.householdId, household.id));

    await pruneOldBoughtItems(household, db);
    expect((await getShoppingList(household, db)).needed).toHaveLength(1);
  });

  it('counts what is still needed, for the nav badge', async () => {
    const { household, member: ana } = await newHousehold();
    expect(await countNeeded(household.id, db)).toBe(0);

    await addShoppingItem(household, { name: 'Milk', addedById: ana.id }, db);
    await addShoppingItem(household, { name: 'Bread', addedById: ana.id }, db);
    expect(await countNeeded(household.id, db)).toBe(2);

    const [entry] = (await getShoppingList(household, db)).needed;
    await setItemBought(household, entry.item.id, true, ana.id, db);
    expect(await countNeeded(household.id, db)).toBe(1);
  });

  it('keeps one household out of another household list', async () => {
    const { household: a, member: anaA } = await newHousehold();
    const { household: b, member: anaB } = await newHousehold();

    await addShoppingItem(a, { name: 'A milk', addedById: anaA.id }, db);
    await addShoppingItem(b, { name: 'B milk', addedById: anaB.id }, db);

    expect((await getShoppingList(a, db)).needed.map((e) => e.item.name)).toEqual(['A milk']);

    // An id from another household must not be actionable.
    const [theirs] = (await getShoppingList(b, db)).needed;
    await setItemBought(a, theirs.item.id, true, anaA.id, db);
    await removeShoppingItem(a, theirs.item.id, db);

    const stillTheirs = await getShoppingList(b, db);
    expect(stillTheirs.needed).toHaveLength(1);
    expect(stillTheirs.bought).toHaveLength(0);
  });

  it('leaves the other household alone when the trolley is cleared', async () => {
    const { household: a, member: anaA } = await newHousehold();
    const { household: b, member: anaB } = await newHousehold();

    await addShoppingItem(b, { name: 'B milk', addedById: anaB.id }, db);
    const [theirs] = (await getShoppingList(b, db)).needed;
    await setItemBought(b, theirs.item.id, true, anaB.id, db);

    await addShoppingItem(a, { name: 'A milk', addedById: anaA.id }, db);
    await clearBoughtItems(a, db);

    expect((await getShoppingList(b, db)).bought).toHaveLength(1);
  });
});
