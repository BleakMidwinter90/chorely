import { beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../lib/db/client';
import { addExpense, getMoneySummary, removeExpense, settleAll } from '../lib/services/expenses';
import { createHousehold, joinHousehold } from '../lib/services/households';
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

describe('shared costs', () => {
  it('splits an expense evenly and works out the payment that clears it', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);

    // Ana fronts a £30 shop for the two of them.
    await addExpense(household, { description: 'Food shop', amount: 3000, paidById: ana.id }, db);

    const summary = await getMoneySummary(household, db);
    expect(summary.entries).toHaveLength(1);
    expect(summary.transfers).toEqual([
      { fromMemberId: ben.id, toMemberId: ana.id, amount: 1500 },
    ]);
    expect(summary.outstanding).toBe(1500);
  });

  it('nets several expenses down to the fewest payments', async () => {
    const { household, member: ana } = await newHousehold();
    const ben = await joinHousehold(household, 'Ben', '🐢', db);
    await joinHousehold(household, 'Cal', '🦊', db);

    await addExpense(household, { description: 'Shop', amount: 3000, paidById: ana.id }, db);
    await addExpense(household, { description: 'Bill', amount: 1500, paidById: ben.id }, db);

    const summary = await getMoneySummary(household, db);
    // Three people, so at most two payments settle it.
    expect(summary.transfers.length).toBeLessThanOrEqual(2);

    // And the ledger genuinely clears.
    const net = new Map(summary.balances.map((entry) => [entry.memberId, entry.net]));
    for (const transfer of summary.transfers) {
      net.set(transfer.fromMemberId, (net.get(transfer.fromMemberId) ?? 0) + transfer.amount);
      net.set(transfer.toMemberId, (net.get(transfer.toMemberId) ?? 0) - transfer.amount);
    }
    for (const value of net.values()) expect(value).toBe(0);
  });

  it('never loses a penny on an uneven split', async () => {
    const { household, member: ana } = await newHousehold();
    await joinHousehold(household, 'Ben', '🐢', db);
    await joinHousehold(household, 'Cal', '🦊', db);

    // £10 between three does not divide.
    await addExpense(household, { description: 'Milk', amount: 1000, paidById: ana.id }, db);

    const summary = await getMoneySummary(household, db);
    const shares = summary.entries[0].shares.reduce((sum, share) => sum + share.amount, 0);
    expect(shares).toBe(1000);
  });

  it('leaves someone who paid for only themselves square', async () => {
    const { household, member: ana } = await newHousehold();

    await addExpense(household, { description: 'Solo', amount: 500, paidById: ana.id }, db);

    const summary = await getMoneySummary(household, db);
    expect(summary.transfers).toEqual([]);
    expect(summary.balances).toEqual([{ memberId: ana.id, net: 0 }]);
  });

  it('keeps settled expenses as history but out of the running total', async () => {
    const { household, member: ana } = await newHousehold();
    await joinHousehold(household, 'Ben', '🐢', db);
    await addExpense(household, { description: 'Shop', amount: 3000, paidById: ana.id }, db);

    await settleAll(household, db);

    const summary = await getMoneySummary(household, db);
    expect(summary.transfers).toEqual([]);
    expect(summary.entries).toHaveLength(0);
    expect(summary.outstanding).toBe(0);
  });

  it('removes an expense on request', async () => {
    const { household, member: ana } = await newHousehold();
    await joinHousehold(household, 'Ben', '🐢', db);
    await addExpense(household, { description: 'Shop', amount: 3000, paidById: ana.id }, db);

    const before = await getMoneySummary(household, db);
    await removeExpense(household, before.entries[0].expense.id, db);

    expect((await getMoneySummary(household, db)).entries).toHaveLength(0);
  });

  it('ignores a payer who is not in the household', async () => {
    const { household } = await newHousehold();
    await addExpense(household, { description: 'Ghost', amount: 500, paidById: 'mb_nobody' }, db);

    expect((await getMoneySummary(household, db)).entries).toHaveLength(0);
  });

  it('keeps one household ledger out of another', async () => {
    const { household: a, member: anaA } = await newHousehold();
    const { household: b, member: anaB } = await newHousehold();

    await addExpense(a, { description: 'A shop', amount: 1000, paidById: anaA.id }, db);
    await addExpense(b, { description: 'B shop', amount: 2000, paidById: anaB.id }, db);

    const summaryA = await getMoneySummary(a, db);
    expect(summaryA.entries.map((entry) => entry.expense.description)).toEqual(['A shop']);

    // Settling one household must not clear the other's books.
    await settleAll(a, db);
    expect((await getMoneySummary(b, db)).entries).toHaveLength(1);
  });

  it('will not let one household delete another household expense', async () => {
    const { household: a } = await newHousehold();
    const { household: b, member: anaB } = await newHousehold();

    await addExpense(b, { description: 'B shop', amount: 2000, paidById: anaB.id }, db);
    const theirs = (await getMoneySummary(b, db)).entries[0];

    await removeExpense(a, theirs.expense.id, db);
    expect((await getMoneySummary(b, db)).entries).toHaveLength(1);
  });
});
