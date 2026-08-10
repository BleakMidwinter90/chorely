/**
 * The shared shopping list.
 */

import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { getDb, type Database } from '../db/client';
import { members, shoppingItems, type Household, type Member, type ShoppingItem } from '../db/schema';
import { createId } from '../ids';

export interface ShoppingEntry {
  item: ShoppingItem;
  addedBy: Member | null;
  boughtBy: Member | null;
}

export interface ShoppingList {
  needed: ShoppingEntry[];
  bought: ShoppingEntry[];
}

/**
 * Everything on the list, split into what is still needed and what is already
 * in the trolley.
 *
 * Bought items stay visible rather than vanishing on tap: mid-shop, "what have
 * I already picked up" is the question the list is actually being asked.
 */
export async function getShoppingList(
  household: Household,
  db: Database = getDb(),
): Promise<ShoppingList> {
  const addedBy = alias(members, 'added_by');
  const boughtBy = alias(members, 'bought_by');

  const rows = await db
    .select({ item: shoppingItems, addedBy, boughtBy })
    .from(shoppingItems)
    .leftJoin(addedBy, eq(addedBy.id, shoppingItems.addedById))
    .leftJoin(boughtBy, eq(boughtBy.id, shoppingItems.boughtById))
    .where(eq(shoppingItems.householdId, household.id))
    .orderBy(asc(shoppingItems.createdAt));

  const entries = rows.map((row) => ({
    item: row.item,
    addedBy: row.addedBy,
    boughtBy: row.boughtBy,
  }));

  return {
    needed: entries.filter((entry) => !entry.item.boughtAt),
    bought: entries
      .filter((entry) => entry.item.boughtAt)
      .sort((a, b) => (b.item.boughtAt?.getTime() ?? 0) - (a.item.boughtAt?.getTime() ?? 0)),
  };
}

export async function addShoppingItem(
  household: Household,
  input: { name: string; note?: string; addedById: string },
  db: Database = getDb(),
): Promise<void> {
  await db.insert(shoppingItems).values({
    id: createId('shopping'),
    householdId: household.id,
    name: input.name.trim(),
    note: input.note?.trim() || null,
    addedById: input.addedById,
  });
}

/**
 * Tick an item off, or put it back.
 *
 * Scoping the write to the household is the authorisation check: an id from
 * another household simply does not match.
 */
export async function setItemBought(
  household: Household,
  itemId: string,
  bought: boolean,
  memberId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(shoppingItems)
    .set(
      bought
        ? { boughtAt: new Date(), boughtById: memberId }
        : { boughtAt: null, boughtById: null },
    )
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, household.id)));
}

export async function removeShoppingItem(
  household: Household,
  itemId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, household.id)));
}

/** Clear the trolley after a shop, leaving anything still needed alone. */
export async function clearBoughtItems(
  household: Household,
  db: Database = getDb(),
): Promise<void> {
  await db
    .delete(shoppingItems)
    .where(
      and(eq(shoppingItems.householdId, household.id), isNotNull(shoppingItems.boughtAt)),
    );
}

/**
 * Tidy away anything bought more than a week ago.
 *
 * Without this the list grows forever, and nobody is ever going to press
 * "clear" as a chore in itself. A week is long enough that the shop is
 * definitely over.
 */
export async function pruneOldBoughtItems(
  household: Household,
  db: Database = getDb(),
): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .delete(shoppingItems)
    .where(
      and(
        eq(shoppingItems.householdId, household.id),
        isNotNull(shoppingItems.boughtAt),
        lt(shoppingItems.boughtAt, cutoff),
      ),
    );
}

/** How many things are still needed — for the badge on the nav. */
export async function countNeeded(
  householdId: string,
  db: Database = getDb(),
): Promise<number> {
  const rows = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(and(eq(shoppingItems.householdId, householdId), isNull(shoppingItems.boughtAt)));
  return rows.length;
}
