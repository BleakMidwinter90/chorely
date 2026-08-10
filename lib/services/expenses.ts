/**
 * Shared costs: recording them, and working out who owes whom.
 */

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import {
  expenseShares,
  expenses,
  members,
  type Expense,
  type Household,
  type Member,
} from '../db/schema';
import { netBalances, settleUp, splitEvenly, type Transfer } from '../domain/settle';
import { createId } from '../ids';

export interface ExpenseEntry {
  expense: Expense;
  paidBy: Member | null;
  shares: Array<{ memberId: string; amount: number }>;
}

export interface MoneySummary {
  entries: ExpenseEntry[];
  transfers: Transfer[];
  /** Net position per member, positive meaning owed. */
  balances: Array<{ memberId: string; net: number }>;
  outstanding: number;
}

/** Record a cost, split evenly across whoever it was for. */
export async function addExpense(
  household: Household,
  input: {
    description: string;
    amount: number;
    paidById: string;
    /** Who it is split between. Defaults to everyone active. */
    betweenIds?: string[];
  },
  db: Database = getDb(),
): Promise<void> {
  const roster = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.householdId, household.id), isNull(members.archivedAt)))
    .orderBy(asc(members.sortOrder), asc(members.id));

  const rosterIds = new Set(roster.map((member) => member.id));
  // Anyone named must actually be in this household; an unknown id is dropped
  // rather than trusted.
  const between = (input.betweenIds ?? roster.map((member) => member.id)).filter((id) =>
    rosterIds.has(id),
  );

  if (between.length === 0 || !rosterIds.has(input.paidById)) return;

  const expenseId = createId('expense');
  await db.insert(expenses).values({
    id: expenseId,
    householdId: household.id,
    description: input.description.trim(),
    amount: input.amount,
    paidById: input.paidById,
  });

  await db.insert(expenseShares).values(
    splitEvenly(input.amount, between).map((share) => ({
      expenseId,
      memberId: share.memberId,
      amount: share.amount,
    })),
  );
}

/** Everything unsettled, plus the payments that would clear it. */
export async function getMoneySummary(
  household: Household,
  db: Database = getDb(),
): Promise<MoneySummary> {
  const rows = await db
    .select({ expense: expenses, paidBy: members })
    .from(expenses)
    .leftJoin(members, eq(members.id, expenses.paidById))
    .where(and(eq(expenses.householdId, household.id), isNull(expenses.settledAt)))
    .orderBy(desc(expenses.createdAt));

  if (rows.length === 0) {
    return { entries: [], transfers: [], balances: [], outstanding: 0 };
  }

  const shareRows = await db
    .select()
    .from(expenseShares)
    .where(
      inArray(
        expenseShares.expenseId,
        rows.map((row) => row.expense.id),
      ),
    );

  const sharesByExpense = new Map<string, Array<{ memberId: string; amount: number }>>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ memberId: share.memberId, amount: share.amount });
    sharesByExpense.set(share.expenseId, list);
  }

  const entries: ExpenseEntry[] = rows.map((row) => ({
    expense: row.expense,
    paidBy: row.paidBy,
    shares: sharesByExpense.get(row.expense.id) ?? [],
  }));

  const balances = netBalances(
    entries.map((entry) => ({ paidById: entry.expense.paidById, shares: entry.shares })),
  );

  return {
    entries,
    balances,
    transfers: settleUp(balances),
    // What is owed in total: the sum of everything anybody is up.
    outstanding: balances.reduce((sum, entry) => sum + Math.max(entry.net, 0), 0),
  };
}

/**
 * Mark everything currently outstanding as settled.
 *
 * Settled expenses stay in the ledger as history rather than being deleted —
 * "what did we spend last month" is a question people ask, and an app that
 * forgets is no use for it.
 */
export async function settleAll(household: Household, db: Database = getDb()): Promise<void> {
  await db
    .update(expenses)
    .set({ settledAt: new Date() })
    .where(and(eq(expenses.householdId, household.id), isNull(expenses.settledAt)));
}

export async function removeExpense(
  household: Household,
  expenseId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.householdId, household.id)));
}
