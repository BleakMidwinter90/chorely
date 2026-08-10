import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';

import { ChoreRow } from '@/components/ChoreRow';
import { getIdentity } from '@/lib/auth/session';
import { getAgenda } from '@/lib/services/households';
import { householdToday } from '@/lib/services/scheduling';

export const metadata = { title: 'Today' };

export default async function TodayPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household, member } = identity;
  const today = householdToday(household);
  const agenda = await getAgenda(household, today);

  // Anything due today or already late is what actually needs doing. Everything
  // else is shown separately and quietly, so the top of the screen stays a
  // short, finishable list rather than a month of obligations.
  const now = agenda.filter((item) => item.status !== 'upcoming');
  const later = agenda.filter((item) => item.status === 'upcoming');
  const mine = now.filter((item) => item.assignee?.id === member.id);

  const heading =
    now.length === 0
      ? 'Nothing needs doing'
      : mine.length > 0
        ? `${mine.length} for you`
        : `${now.length} to do`;

  const subheading =
    now.length === 0
      ? 'The house is on top of things. Enjoy it.'
      : mine.length > 0
        ? 'Tap Done when you finish something.'
        : 'None of it is your turn — but you can pick anything up.';

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow mb-2">Today</p>
        <h1 className="display text-4xl text-balance sm:text-5xl">{heading}</h1>
        <p className="mt-3 max-w-md text-[15px] text-pretty text-ink-muted">{subheading}</p>
      </header>

      {agenda.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <p className="display text-2xl">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-pretty text-ink-muted">
            Add the things that actually need doing around your home, and chorely will work out
            whose turn each one is.
          </p>
          <Link
            href="/home/chores"
            className="tap mt-6 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Add a chore
          </Link>
        </div>
      ) : (
        <>
          {now.length > 0 ? (
            <ul className="panel px-4">
              {now.map((item) => (
                <ChoreRow key={item.occurrence.id} item={item} today={today} viewerId={member.id} />
              ))}
            </ul>
          ) : (
            <div className="panel px-6 py-12 text-center">
              <p className="display text-2xl">All clear</p>
              <p className="mt-2 text-sm text-ink-muted">Nothing is due right now.</p>
            </div>
          )}

          {later.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="eyebrow">Coming up</h2>
                <Link
                  href="/home/chores"
                  className="inline-flex items-center gap-1 text-xs text-ink-faint transition-colors hover:text-ink"
                >
                  All chores
                  <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
                </Link>
              </div>
              <ul className="panel px-4 opacity-75 transition-opacity hover:opacity-100">
                {later.slice(0, 6).map((item) => (
                  <ChoreRow
                    key={item.occurrence.id}
                    item={item}
                    today={today}
                    viewerId={member.id}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
