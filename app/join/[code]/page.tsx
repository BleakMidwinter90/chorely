import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JoinForm } from '@/components/JoinForm';
import { getIdentity } from '@/lib/auth/session';
import { findHouseholdByJoinCode, listMembers } from '@/lib/services/households';

export default async function JoinPage({ params }: PageProps<'/join/[code]'>) {
  const { code } = await params;

  // Runs the migration check and tells us whether this device is already known.
  const identity = await getIdentity();

  const household = await findHouseholdByJoinCode(code);
  if (!household) notFound();

  // Someone re-opening the link on a device that already joined should not end
  // up as a second person in the list.
  if (identity?.household.id === household.id) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 text-center">
        <p className="mb-3 text-4xl">👋</p>
        <h1 className="text-2xl font-semibold">You&rsquo;re already in {household.name}</h1>
        <Link
          href="/home"
          className="tap mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-6 font-medium text-white dark:text-stone-950"
        >
          Go to your chores
        </Link>
      </main>
    );
  }

  const existing = await listMembers(household.id);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
      <header className="mb-8 text-center">
        <p className="mb-3 text-4xl">🏠</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Join {household.name}
        </h1>
        {existing.length > 0 && (
          <p className="mt-3 text-sm text-ink-muted">
            {existing.map((member) => member.emoji).join(' ')}{' '}
            {existing.length === 1
              ? `${existing[0].name} is already here`
              : `${existing.length} people are already here`}
          </p>
        )}
      </header>

      <JoinForm joinCode={code} householdName={household.name} />
    </main>
  );
}
