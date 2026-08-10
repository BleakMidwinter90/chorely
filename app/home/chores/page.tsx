import { redirect } from 'next/navigation';

import { archiveChoreAction } from '@/app/actions';
import { NewChoreForm } from '@/components/NewChoreForm';
import { SubmitButton } from '@/components/SubmitButton';
import { getIdentity } from '@/lib/auth/session';
import { describeRecurrence } from '@/lib/domain/recurrence';
import { listChores, listMembers } from '@/lib/services/households';

const ROTATION_LABEL = {
  fair: 'Whoever has done least',
  rotate: 'Taking turns',
  fixed: 'Always the same person',
  anyone: 'Anyone',
} as const;

export default async function ChoresPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household } = identity;
  const [chores, members] = await Promise.all([
    listChores(household.id),
    listMembers(household.id),
  ]);

  const memberName = (id: string | null) =>
    members.find((member) => member.id === id)?.name ?? 'someone';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Chores</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {chores.length === 0
            ? 'Nothing set up yet.'
            : `${chores.length} on the go in ${household.name}.`}
        </p>
      </header>

      <NewChoreForm members={members} />

      {chores.length > 0 && (
        <ul className="card divide-y divide-line">
          {chores.map((chore) => (
            <li key={chore.id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden className="text-xl">
                {chore.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{chore.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {describeRecurrence(chore.recurrence)} · {chore.effort}{' '}
                  {chore.effort === 1 ? 'point' : 'points'} ·{' '}
                  {chore.rotationMode === 'fixed'
                    ? `Always ${memberName(chore.fixedMemberId)}`
                    : ROTATION_LABEL[chore.rotationMode]}
                </p>
              </div>
              <form action={archiveChoreAction}>
                <input type="hidden" name="choreId" value={chore.id} />
                <SubmitButton variant="quiet" className="px-3" title="Retire this chore">
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-muted">
        Removing a chore stops it coming back, but keeps the work already done in the balance —
        deleting it outright would quietly rewrite who&rsquo;d been pulling their weight.
      </p>
    </div>
  );
}
