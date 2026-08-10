import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { signOutAction, updateMemberWeightAction } from '@/app/actions';
import { InviteLink } from '@/components/InviteLink';
import { SubmitButton } from '@/components/SubmitButton';
import { getIdentity } from '@/lib/auth/session';
import { listMembers } from '@/lib/services/households';

/** Presets, so nobody has to reason about a decimal weight. */
const SHARE_OPTIONS = [
  { value: 1, label: 'A full share' },
  { value: 0.75, label: 'Three quarters' },
  { value: 0.5, label: 'Half a share' },
  { value: 0.25, label: 'A quarter' },
  { value: 1.5, label: 'A share and a half' },
] as const;

export default async function SettingsPage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household, member: viewer } = identity;
  const members = await listMembers(household.id);

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const inviteUrl = `${protocol}://${host}/join/${household.joinCode}`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{household.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {members.length} {members.length === 1 ? 'person' : 'people'} · {household.timezone}
        </p>
      </header>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">Invite the people you live with</h2>
        <InviteLink url={inviteUrl} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Shares</h2>
        <p className="text-sm text-ink-muted">
          A fair split isn&rsquo;t always an equal one. If someone works nights, travels, or the
          house has simply agreed they do less, set it here and the balance will expect that
          instead.
        </p>

        <ul className="card divide-y divide-line">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-3">
              <span aria-hidden className="text-xl">
                {member.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {member.name}
                {member.id === viewer.id && (
                  <span className="ml-1.5 text-xs text-ink-muted">(you)</span>
                )}
              </span>
              <form action={updateMemberWeightAction} className="flex items-center gap-2">
                <input type="hidden" name="memberId" value={member.id} />
                <label className="sr-only" htmlFor={`weight-${member.id}`}>
                  {member.name}&rsquo;s share
                </label>
                <select
                  id={`weight-${member.id}`}
                  name="weight"
                  defaultValue={member.weight}
                  className="tap rounded-xl border border-line bg-surface-sunk px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
                >
                  {SHARE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="quiet" className="px-3">
                  Save
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">This device</h2>
        <form action={signOutAction}>
          <SubmitButton variant="quiet">Sign out of {household.name}</SubmitButton>
        </form>
        <p className="text-xs text-ink-muted">
          Signing out only affects this device. Your name and everything you&rsquo;ve done stay in
          the household.
        </p>
      </section>
    </div>
  );
}
