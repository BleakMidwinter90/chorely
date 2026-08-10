import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { signOutAction, updateMemberWeightAction } from '@/app/actions';
import { ApiTokens } from '@/components/ApiTokens';
import { AwayForm } from '@/components/AwayForm';
import { InstallPrompt } from '@/components/InstallPrompt';
import { NotificationSetup } from '@/components/NotificationSetup';
import { ReminderTimeForm } from '@/components/ReminderTimeForm';
import { InviteLink } from '@/components/InviteLink';
import { SubmitButton } from '@/components/SubmitButton';
import { getIdentity } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { apiTokens } from '@/lib/db/schema';
import { listMembers } from '@/lib/services/households';
import { householdToday } from '@/lib/services/scheduling';

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
  const today = householdToday(household);
  const members = await listMembers(household.id);
  const tokens = (
    await getDb()
      .select({
        prefix: apiTokens.prefix,
        name: apiTokens.name,
        lastUsedAt: apiTokens.lastUsedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.householdId, household.id))
      .orderBy(apiTokens.createdAt)
  ).map((token) => ({ ...token, lastUsedAt: token.lastUsedAt ?? null }));

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const inviteUrl = `${protocol}://${host}/join/${household.joinCode}`;

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Your home</p>
        <h1 className="display text-4xl sm:text-5xl">{household.name}</h1>
        <p className="mt-3 text-[15px] text-ink-muted">
          {members.length} {members.length === 1 ? 'person' : 'people'} · {household.timezone}
        </p>
      </header>

      <InstallPrompt />

      <section className="space-y-3">
        <h2 className="eyebrow">Away</h2>
        <AwayForm awayFrom={viewer.awayFrom} awayUntil={viewer.awayUntil} today={today} />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Reminders</h2>
        <NotificationSetup />
        <ReminderTimeForm
          enabled={viewer.remindersEnabled}
          hour={viewer.reminderHour}
        />
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="text-[15px] font-medium">Invite the people you live with</h2>
        <InviteLink url={inviteUrl} />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Shares</h2>
        <p className="text-sm text-ink-muted">
          A fair split isn&rsquo;t always an equal one. If someone works nights, travels, or the
          house has simply agreed they do less, set it here and the balance will expect that
          instead.
        </p>

        <ul className="panel px-4">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-b-0">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk text-base leading-none">
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
                  className="tap rounded-xl border border-line bg-sunk px-3 text-sm outline-none focus:ring-2 focus:ring-brand"
                >
                  {SHARE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="quiet" size="sm">
                  Save
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Your data</h2>
        <ApiTokens tokens={tokens} />
        <a
          href="/api/v1/export"
          className="inline-block text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Download everything as JSON
        </a>
        <p className="text-xs text-pretty text-ink-faint">
          Your whole household, in one file. Secrets are left out — an export is something
          people email to themselves.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">This device</h2>
        <form action={signOutAction}>
          <SubmitButton variant="quiet" size="sm">Sign out of {household.name}</SubmitButton>
        </form>
        <p className="text-xs text-ink-muted">
          Signing out only affects this device. Your name and everything you&rsquo;ve done stay in
          the household.
        </p>
      </section>
    </div>
  );
}
