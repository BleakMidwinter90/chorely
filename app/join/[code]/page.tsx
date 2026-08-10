import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { JoinForm } from '@/components/JoinForm';
import { getIdentity } from '@/lib/auth/session';
import { findHouseholdByJoinCode, listMembers } from '@/lib/services/households';

export const metadata = { title: 'Join a home' };

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
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16 text-center">
        <h1 className="display text-3xl text-balance">
          You&rsquo;re already in {household.name}
        </h1>
        <Link
          href="/home"
          className="tap mt-7 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-6 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Go to your chores
          <ArrowRight size={16} strokeWidth={2} aria-hidden />
        </Link>
      </main>
    );
  }

  const existing = await listMembers(household.id);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-16">
      <header className="mb-8">
        <p className="eyebrow mb-3">You&rsquo;ve been invited</p>
        <h1 className="display text-4xl text-balance">{household.name}</h1>
        {existing.length > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span aria-hidden className="text-base leading-none">
              {existing.map((member) => member.emoji).join(' ')}
            </span>
            <span>
              {existing.length === 1
                ? `${existing[0].name} is already here`
                : `${existing.length} people are already here`}
            </span>
          </p>
        )}
      </header>

      <JoinForm joinCode={code} householdName={household.name} />
    </main>
  );
}
