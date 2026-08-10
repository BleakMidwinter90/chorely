import { redirect } from 'next/navigation';

import { CreateHouseholdForm } from '@/components/CreateHouseholdForm';
import { getIdentity } from '@/lib/auth/session';

export default async function LandingPage() {
  // Anyone already in a household goes straight to their chores.
  if (await getIdentity()) redirect('/home');

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-12">
      <header className="mb-10">
        <p className="mb-3 text-4xl">🧹</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          A fair share of the housework.
        </h1>
        <p className="mt-3 text-pretty text-ink-muted">
          Most homes don&rsquo;t argue about the schedule. They argue about who&rsquo;s pulling
          their weight. chorely rotates the chores and keeps an honest tally, so nobody has to
          rely on memory.
        </p>
      </header>

      <CreateHouseholdForm />

      <section className="mt-10 grid gap-4 text-sm text-ink-muted sm:grid-cols-3">
        <div>
          <h2 className="mb-1 font-medium text-ink">It rotates itself</h2>
          <p>Chores go to whoever&rsquo;s done least lately, weighted by effort.</p>
        </div>
        <div>
          <h2 className="mb-1 font-medium text-ink">It keeps score honestly</h2>
          <p>A single balance number, with the receipts behind it.</p>
        </div>
        <div>
          <h2 className="mb-1 font-medium text-ink">It&rsquo;s yours</h2>
          <p>Self-host it. Your data stays in one file you control.</p>
        </div>
      </section>
    </main>
  );
}
