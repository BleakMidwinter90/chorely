import { redirect } from 'next/navigation';

import { CreateHouseholdForm } from '@/components/CreateHouseholdForm';
import { getIdentity } from '@/lib/auth/session';

const PRINCIPLES = [
  {
    title: 'It rotates itself',
    body: 'Each chore goes to whoever has done least lately, weighted by how much effort it takes.',
  },
  {
    title: 'It keeps score honestly',
    body: 'One number for how evenly the work is split, with every completion listed underneath it.',
  },
  {
    title: 'It never nags',
    body: 'No leaderboards, no red, no notifications guilting anyone. It states facts and stops.',
  },
  {
    title: 'It belongs to you',
    body: 'Self-hosted, no accounts, no subscription. Your household lives in one file you control.',
  },
];

export default async function LandingPage() {
  // Anyone already in a household goes straight to their chores.
  if (await getIdentity()) redirect('/home');

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-12 sm:py-20">
      <div className="grid gap-14 lg:grid-cols-[1.05fr_minmax(0,26rem)] lg:gap-20">
        <div className="lg:pt-8">
          <p className="eyebrow mb-5">chorely</p>

          <h1 className="display text-[2.75rem] leading-[1.02] text-balance sm:text-6xl lg:text-[4.25rem]">
            A fair share of the housework.
          </h1>

          <p className="mt-7 max-w-lg text-lg leading-relaxed text-pretty text-ink-muted">
            Most homes don&rsquo;t argue about the schedule. They argue about who&rsquo;s pulling
            their weight — usually from memory, usually badly. chorely rotates the chores and
            keeps an honest tally, so nobody has to be the one who brings it up.
          </p>

          <dl className="mt-12 grid max-w-lg gap-x-10 gap-y-7 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <div key={principle.title}>
                <dt className="text-[15px] font-medium">{principle.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-pretty text-ink-muted">
                  {principle.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lg:sticky lg:top-12 lg:self-start">
          <CreateHouseholdForm />
        </div>
      </div>

      <footer className="mt-20 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-6 text-xs text-ink-faint">
        <span>Free and open source, MIT licensed.</span>
        <a
          href="https://github.com/BleakMidwinter90/chorely"
          className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
