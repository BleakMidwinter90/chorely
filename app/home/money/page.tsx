import { redirect } from 'next/navigation';
import { ArrowRight, Trash2 } from 'lucide-react';

import { addExpenseAction, removeExpenseAction, settleUpAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { fieldClass } from '@/components/formStyles';
import { getIdentity } from '@/lib/auth/session';
import { formatMoney } from '@/lib/domain/settle';
import { getMoneySummary } from '@/lib/services/expenses';
import { listMembers } from '@/lib/services/households';

export const metadata = { title: 'Money' };

export default async function MoneyPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household, member: viewer } = identity;
  const [summary, members] = await Promise.all([
    getMoneySummary(household),
    listMembers(household.id),
  ]);

  const nameOf = (id: string) => members.find((member) => member.id === id)?.name ?? 'Someone';
  const money = (amount: number) => formatMoney(amount, household.currency);

  const mine = summary.transfers.filter(
    (transfer) => transfer.fromMemberId === viewer.id || transfer.toMemberId === viewer.id,
  );

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow mb-2">Shared costs</p>
        <h1 className="display text-4xl sm:text-5xl">Money</h1>
        <p className="mt-3 max-w-md text-[15px] text-pretty text-ink-muted">
          Anything somebody fronted for the house. Split evenly, to the penny.
        </p>
      </header>

      <form action={addExpenseAction} className="panel space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="description">
            What was it for?
          </label>
          <input
            id="description"
            name="description"
            required
            maxLength={80}
            placeholder="Food shop"
            autoComplete="off"
            className={`${fieldClass} min-w-0 flex-[2]`}
          />
          <label className="sr-only" htmlFor="amount">
            How much?
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            inputMode="decimal"
            className={`${fieldClass} min-w-0 flex-1`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="paidById" className="text-sm text-ink-muted">
            Paid by
          </label>
          <select
            id="paidById"
            name="paidById"
            defaultValue={viewer.id}
            className={`${fieldClass} w-auto`}
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.emoji} {member.name}
              </option>
            ))}
          </select>
          <SubmitButton size="sm" className="ml-auto">
            Add
          </SubmitButton>
        </div>
      </form>

      <section>
        <h2 className="eyebrow mb-4">Settling up</h2>

        {summary.transfers.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="display text-xl">Nobody owes anybody</p>
            <p className="mt-2 text-sm text-ink-muted">
              {summary.entries.length === 0
                ? 'Add a shared cost and it will work out who owes what.'
                : 'Everything is square.'}
            </p>
          </div>
        ) : (
          <>
            <ul className="panel px-4">
              {summary.transfers.map((transfer) => {
                const involvesMe =
                  transfer.fromMemberId === viewer.id || transfer.toMemberId === viewer.id;
                return (
                  <li
                    key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                    className={`flex flex-wrap items-center gap-2 border-b border-line py-3 text-[15px] last:border-b-0 ${
                      involvesMe ? '' : 'text-ink-muted'
                    }`}
                  >
                    <span className={involvesMe ? 'font-medium' : undefined}>
                      {transfer.fromMemberId === viewer.id ? 'You' : nameOf(transfer.fromMemberId)}
                    </span>
                    <ArrowRight size={15} strokeWidth={1.7} aria-hidden className="text-ink-faint" />
                    <span className={involvesMe ? 'font-medium' : undefined}>
                      {transfer.toMemberId === viewer.id ? 'you' : nameOf(transfer.toMemberId)}
                    </span>
                    <span className="numeric ml-auto font-medium">{money(transfer.amount)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <form action={settleUpAction}>
                <SubmitButton variant="quiet" size="sm">
                  Mark all settled
                </SubmitButton>
              </form>
              <p className="text-xs text-pretty text-ink-faint">
                {mine.length === 0
                  ? "You're square — this is between the others."
                  : 'Clears the ledger. Everything stays in the history.'}
              </p>
            </div>
          </>
        )}
      </section>

      {summary.entries.length > 0 && (
        <section>
          <h2 className="eyebrow mb-4">Outstanding · {money(summary.outstanding)}</h2>
          <ul className="panel px-4">
            {summary.entries.map((entry) => (
              <li
                key={entry.expense.id}
                className="flex items-center gap-3 border-b border-line py-3 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px]">{entry.expense.description}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {entry.paidBy?.name ?? 'Someone'} paid · split {entry.shares.length}{' '}
                    {entry.shares.length === 1 ? 'way' : 'ways'}
                  </p>
                </div>
                <span className="numeric shrink-0">{money(entry.expense.amount)}</span>
                <form action={removeExpenseAction}>
                  <input type="hidden" name="expenseId" value={entry.expense.id} />
                  <SubmitButton
                    variant="quiet"
                    size="sm"
                    icon={<Trash2 size={14} strokeWidth={1.7} aria-hidden />}
                    label={`Remove ${entry.expense.description}`}
                    className="!px-2.5"
                  >
                    <span className="sr-only" />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
