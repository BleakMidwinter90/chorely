import { redirect } from 'next/navigation';

import { archiveChoreAction } from '@/app/actions';
import { ChoreNotes } from '@/components/ChoreNotes';
import { NewChoreForm } from '@/components/NewChoreForm';
import { TemplatePicker } from '@/components/TemplatePicker';
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

  // Built once rather than scanned per chore.
  const nameById = new Map(members.map((member) => [member.id, member.name]));
  const memberName = (id: string | null) => (id && nameById.get(id)) || 'someone';

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Set up</p>
        <h1 className="display text-4xl sm:text-5xl">Chores</h1>
        <p className="mt-3 text-[15px] text-ink-muted">
          {chores.length === 0
            ? 'Nothing set up yet.'
            : `${chores.length} on the go in ${household.name}.`}
        </p>
      </header>

      <div className="space-y-3">
        <TemplatePicker existingNames={chores.map((chore) => chore.name)} />
        <NewChoreForm members={members} />
      </div>

      {chores.length > 0 && (
        <ul className="panel px-4">
          {chores.map((chore) => (
            <li key={chore.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunk text-[19px] leading-none">
                {chore.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] leading-snug">{chore.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {describeRecurrence(chore.recurrence)} · {chore.effort}{' '}
                  {chore.effort === 1 ? 'point' : 'points'} ·{' '}
                  {chore.rotationMode === 'fixed'
                    ? `Always ${memberName(chore.fixedMemberId)}`
                    : ROTATION_LABEL[chore.rotationMode]}
                </p>
                <ChoreNotes choreId={chore.id} notes={chore.notes} />
              </div>
              <form action={archiveChoreAction}>
                <input type="hidden" name="choreId" value={chore.id} />
                <SubmitButton variant="quiet" size="sm" title="Retire this chore">
                  Remove
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="max-w-md text-xs text-pretty text-ink-faint">
        Removing a chore stops it coming back, but keeps the work already done in the balance —
        deleting it outright would quietly rewrite who&rsquo;d been pulling their weight.
      </p>
    </div>
  );
}
