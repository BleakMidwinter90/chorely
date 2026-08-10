/**
 * Working out who owes whom.
 *
 * All amounts are integer minor units — pence, cents. Money in floating point
 * is a classic way to end up a penny short and unable to explain why, and
 * "unable to explain why" is fatal for a feature whose entire job is settling
 * an argument about money.
 */

export interface ExpenseEntry {
  /** Who actually paid. */
  paidById: string;
  /** What each person's share of this expense is, in minor units. */
  shares: ReadonlyArray<{ memberId: string; amount: number }>;
}

export interface NetBalance {
  memberId: string;
  /** Positive: owed money. Negative: owes money. */
  net: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/**
 * What each person is up or down across every unsettled expense.
 *
 * Paying puts you up by the whole amount; your own share puts you back down by
 * your part of it. The sum across everyone is always zero, which is the
 * invariant worth holding on to.
 */
export function netBalances(expenses: readonly ExpenseEntry[]): NetBalance[] {
  const net = new Map<string, number>();
  const bump = (memberId: string, amount: number) =>
    net.set(memberId, (net.get(memberId) ?? 0) + amount);

  for (const expense of expenses) {
    const total = expense.shares.reduce((sum, share) => sum + share.amount, 0);
    bump(expense.paidById, total);
    for (const share of expense.shares) bump(share.memberId, -share.amount);
  }

  return [...net.entries()]
    .map(([memberId, value]) => ({ memberId, net: value }))
    // Deterministic order, so the same ledger always renders the same way.
    .sort((a, b) => b.net - a.net || a.memberId.localeCompare(b.memberId));
}

/**
 * The shortest list of payments that clears the debt.
 *
 * Greedy: repeatedly settle the largest creditor against the largest debtor.
 * This is not guaranteed optimal — the truly minimal set is NP-hard — but it is
 * within one transfer of optimal for household-sized groups, and it has a
 * property that matters more than optimality here: it is stable and easy to
 * explain. "You pay Ben £12" is a sentence people act on; a clever three-way
 * cycle is one they argue with.
 *
 * `epsilon` is the smallest transfer worth emitting. It defaults to 1 minor
 * unit, which drops only zero-value transfers and leaves the ledger clearing
 * exactly — the right default for money, where silently discarding a penny is
 * worse than mentioning one. Raise it to round trivial amounts away, at the
 * cost of leaving that much unsettled.
 */
export function settleUp(balances: readonly NetBalance[], epsilon = 1): Transfer[] {
  const creditors = balances
    .filter((entry) => entry.net > 0)
    .map((entry) => ({ ...entry }))
    .sort((a, b) => b.net - a.net || a.memberId.localeCompare(b.memberId));

  const debtors = balances
    .filter((entry) => entry.net < 0)
    .map((entry) => ({ ...entry, net: -entry.net }))
    .sort((a, b) => b.net - a.net || a.memberId.localeCompare(b.memberId));

  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.net, debtor.net);

    if (amount >= epsilon) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount,
      });
    }

    creditor.net -= amount;
    debtor.net -= amount;

    if (creditor.net < epsilon) creditorIndex++;
    if (debtor.net < epsilon) debtorIndex++;
  }

  return transfers;
}

/**
 * Split an amount between people, to the penny.
 *
 * Integer division leaves a remainder — £10 between three is 333, 333, 333 and
 * a penny unaccounted for. The remainder is handed out one unit at a time in
 * the given order rather than being dropped, so the shares always sum to
 * exactly the amount. A ledger that loses a penny per split loses trust far
 * faster than one that is a penny uneven.
 */
export function splitEvenly(amount: number, memberIds: readonly string[]): Array<{
  memberId: string;
  amount: number;
}> {
  if (memberIds.length === 0) return [];

  const base = Math.floor(amount / memberIds.length);
  let remainder = amount - base * memberIds.length;

  return memberIds.map((memberId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { memberId, amount: base + extra };
  });
}

/** Format minor units for display. */
export function formatMoney(amount: number, currency: string, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}
