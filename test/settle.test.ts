import { describe, expect, it } from 'vitest';

import {
  formatMoney,
  netBalances,
  settleUp,
  splitEvenly,
  type ExpenseEntry,
} from '../lib/domain/settle';

describe('splitEvenly', () => {
  it('splits an exact amount cleanly', () => {
    expect(splitEvenly(900, ['ana', 'ben', 'cal'])).toEqual([
      { memberId: 'ana', amount: 300 },
      { memberId: 'ben', amount: 300 },
      { memberId: 'cal', amount: 300 },
    ]);
  });

  it('never loses the remainder', () => {
    // £10 between three is 333.33 each; the stray penny has to land somewhere.
    const shares = splitEvenly(1000, ['ana', 'ben', 'cal']);
    expect(shares.map((share) => share.amount)).toEqual([334, 333, 333]);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(1000);
  });

  it('always sums to exactly the amount, for any split', () => {
    for (const amount of [1, 7, 99, 100, 1234, 99999]) {
      for (const size of [1, 2, 3, 4, 5, 7]) {
        const people = Array.from({ length: size }, (_, i) => `m${i}`);
        const total = splitEvenly(amount, people).reduce((sum, s) => sum + s.amount, 0);
        expect(total).toBe(amount);
      }
    }
  });

  it('handles a household of one, and of none', () => {
    expect(splitEvenly(500, ['ana'])).toEqual([{ memberId: 'ana', amount: 500 }]);
    expect(splitEvenly(500, [])).toEqual([]);
  });
});

describe('netBalances', () => {
  it('leaves someone who paid for exactly their own share level', () => {
    const expenses: ExpenseEntry[] = [
      { paidById: 'ana', shares: [{ memberId: 'ana', amount: 1000 }] },
    ];
    expect(netBalances(expenses)).toEqual([{ memberId: 'ana', net: 0 }]);
  });

  it('puts the payer up and the others down', () => {
    const expenses: ExpenseEntry[] = [
      {
        paidById: 'ana',
        shares: [
          { memberId: 'ana', amount: 500 },
          { memberId: 'ben', amount: 500 },
        ],
      },
    ];
    expect(netBalances(expenses)).toEqual([
      { memberId: 'ana', net: 500 },
      { memberId: 'ben', net: -500 },
    ]);
  });

  it('always sums to zero, however tangled the ledger', () => {
    const expenses: ExpenseEntry[] = [
      {
        paidById: 'ana',
        shares: [
          { memberId: 'ana', amount: 334 },
          { memberId: 'ben', amount: 333 },
          { memberId: 'cal', amount: 333 },
        ],
      },
      {
        paidById: 'ben',
        shares: [
          { memberId: 'ana', amount: 700 },
          { memberId: 'ben', amount: 700 },
        ],
      },
      {
        paidById: 'cal',
        shares: [
          { memberId: 'ana', amount: 250 },
          { memberId: 'cal', amount: 250 },
        ],
      },
    ];

    const total = netBalances(expenses).reduce((sum, entry) => sum + entry.net, 0);
    expect(total).toBe(0);
  });
});

describe('settleUp', () => {
  it('produces nothing when everyone is level', () => {
    expect(settleUp([{ memberId: 'ana', net: 0 }, { memberId: 'ben', net: 0 }])).toEqual([]);
    expect(settleUp([])).toEqual([]);
  });

  it('settles a simple two-person debt in one payment', () => {
    const transfers = settleUp([
      { memberId: 'ana', net: 500 },
      { memberId: 'ben', net: -500 },
    ]);
    expect(transfers).toEqual([{ fromMemberId: 'ben', toMemberId: 'ana', amount: 500 }]);
  });

  it('clears every debt exactly', () => {
    const balances = [
      { memberId: 'ana', net: 1200 },
      { memberId: 'ben', net: -500 },
      { memberId: 'cal', net: -700 },
    ];
    const transfers = settleUp(balances);

    // Everyone ends level.
    const after = new Map(balances.map((b) => [b.memberId, b.net]));
    for (const transfer of transfers) {
      after.set(transfer.fromMemberId, (after.get(transfer.fromMemberId) ?? 0) + transfer.amount);
      after.set(transfer.toMemberId, (after.get(transfer.toMemberId) ?? 0) - transfer.amount);
    }
    for (const value of after.values()) expect(value).toBe(0);
  });

  it('needs at most one payment fewer than there are people', () => {
    // The property that makes this useful: a house of four never gets handed
    // a page of transactions.
    const balances = [
      { memberId: 'ana', net: 1000 },
      { memberId: 'ben', net: 500 },
      { memberId: 'cal', net: -900 },
      { memberId: 'dee', net: -600 },
    ];
    expect(settleUp(balances).length).toBeLessThanOrEqual(balances.length - 1);
  });

  it('never emits a zero-value transfer', () => {
    const transfers = settleUp([
      { memberId: 'ana', net: 1000 },
      { memberId: 'ben', net: -999 },
      { memberId: 'cal', net: -1 },
    ]);
    expect(transfers.every((transfer) => transfer.amount >= 1)).toBe(true);
    // By default the ledger clears exactly, penny included. Silently dropping
    // money is worse than mentioning a small amount.
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(1000);
  });

  it('lets a caller round trivial amounts away, and says what that costs', () => {
    const balances = [
      { memberId: 'ana', net: 1000 },
      { memberId: 'ben', net: -999 },
      { memberId: 'cal', net: -1 },
    ];
    const transfers = settleUp(balances, 50);

    expect(transfers).toEqual([{ fromMemberId: 'ben', toMemberId: 'ana', amount: 999 }]);
    // The penny is deliberately left unsettled rather than invented away.
    expect(transfers.reduce((sum, t) => sum + t.amount, 0)).toBe(999);
  });

  it('is deterministic — the same ledger renders the same way every time', () => {
    const balances = [
      { memberId: 'cal', net: -700 },
      { memberId: 'ana', net: 1200 },
      { memberId: 'ben', net: -500 },
    ];
    expect(settleUp(balances)).toEqual(settleUp([...balances].reverse()));
  });

  it('settles a real household ledger end to end', () => {
    // Ana buys a £30 shop for three; Ben pays a £14 bill split with Ana.
    const expenses: ExpenseEntry[] = [
      {
        paidById: 'ana',
        shares: [
          { memberId: 'ana', amount: 1000 },
          { memberId: 'ben', amount: 1000 },
          { memberId: 'cal', amount: 1000 },
        ],
      },
      {
        paidById: 'ben',
        shares: [
          { memberId: 'ana', amount: 700 },
          { memberId: 'ben', amount: 700 },
        ],
      },
    ];

    const transfers = settleUp(netBalances(expenses));
    // Ana is up 1300, Ben down 300, Cal down 1000.
    expect(transfers).toEqual([
      { fromMemberId: 'cal', toMemberId: 'ana', amount: 1000 },
      { fromMemberId: 'ben', toMemberId: 'ana', amount: 300 },
    ]);
  });
});

describe('formatMoney', () => {
  it('renders minor units as currency', () => {
    expect(formatMoney(1234, 'GBP', 'en-GB')).toBe('£12.34');
    expect(formatMoney(0, 'GBP', 'en-GB')).toBe('£0.00');
    expect(formatMoney(100000, 'GBP', 'en-GB')).toBe('£1,000.00');
  });
});
