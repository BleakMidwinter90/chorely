import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ChoreRow } from '@/components/ChoreRow';
import { getIdentity } from '@/lib/auth/session';
import { getAgenda } from '@/lib/services/households';
import { householdToday } from '@/lib/services/scheduling';

export default async function TodayPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household, member } = identity;
  const today = householdToday(household);
  const agenda = await getAgenda(household, today);

  // Anything due today or already late is what actually needs doing. Everything
  // else is shown separately and quietly, so the top of the screen is a short,
  // finishable list rather than a month of obligations.
  const now = agenda.filter((item) => item.status !== 'upcoming');
  const later = agenda.filter((item) => item.status === 'upcoming');
  const mine = now.filter((item) => item.assignee?.id === member.id);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {now.length === 0
            ? 'Nothing needs doing'
            : mine.length === 0
              ? `${now.length} ${now.length === 1 ? 'thing' : 'things'} to do`
              : `${mine.length} for you today`}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {now.length === 0
            ? 'The house is on top of things. Enjoy it.'
            : mine.length === 0
              ? 'None of it is your turn — but you can pick anything up.'
              : 'Tap Done when you finish something.'}
        </p>
      </header>

      {agenda.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="mb-3 text-3xl">🌱</p>
          <p className="font-medium">No chores yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Add the things that actually need doing around your home.
          </p>
          <Link
            href="/home/chores"
            className="tap mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-white dark:text-stone-950"
          >
            Add a chore
          </Link>
        </div>
      ) : (
        <>
          {now.length > 0 && (
            <ul className="space-y-2">
              {now.map((item) => (
                <ChoreRow
                  key={item.occurrence.id}
                  item={item}
                  today={today}
                  viewerId={member.id}
                />
              ))}
            </ul>
          )}

          {now.length === 0 && (
            <div className="card p-8 text-center">
              <p className="mb-3 text-3xl">✨</p>
              <p className="font-medium">All clear</p>
              <p className="mt-1 text-sm text-ink-muted">Nothing is due right now.</p>
            </div>
          )}

          {later.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Coming up</h2>
              <ul className="space-y-2 opacity-70">
                {later.slice(0, 8).map((item) => (
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
