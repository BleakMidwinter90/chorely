import { redirect } from 'next/navigation';

import { BalanceMeter } from '@/components/BalanceMeter';
import { getIdentity } from '@/lib/auth/session';
import { describeBalance } from '@/lib/domain/fairness';
import { getHouseholdBalance, getRecentActivity } from '@/lib/services/ledger';
import { householdToday } from '@/lib/services/scheduling';

/** Warm at the top, honest at the bottom — never alarming. */
function scoreTone(balance: number): { label: string; className: string } {
  if (balance >= 90) return { label: 'Even', className: 'text-accent' };
  if (balance >= 70) return { label: 'Roughly even', className: 'text-accent' };
  if (balance >= 45) return { label: 'A bit lopsided', className: 'text-late' };
  return { label: 'Lopsided', className: 'text-late' };
}

export default async function BalancePage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household } = identity;
  const today = householdToday(household);
  const [{ report, members, nameOf }, activity] = await Promise.all([
    getHouseholdBalance(household, today),
    getRecentActivity(household, 20),
  ]);

  const tone = scoreTone(report.balance);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Balance</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Last {household.fairnessWindowDays} days.
        </p>
      </header>

      <section className="card p-6">
        <div className="flex items-baseline gap-3">
          <span className={`text-5xl font-semibold tabular-nums ${tone.className}`}>
            {Math.round(report.balance)}
          </span>
          <div>
            <p className={`font-medium ${tone.className}`}>{tone.label}</p>
            <p className="text-xs text-ink-muted">out of 100</p>
          </div>
        </div>
        <p className="mt-4 text-pretty text-sm text-ink-muted">
          {describeBalance(report, nameOf)}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink-muted">Who did what</h2>
        <BalanceMeter report={report} members={members} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink-muted">Recent</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing finished yet.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span aria-hidden className="text-lg">
                  {entry.chore.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.chore.name}</span>
                <span className="shrink-0 text-ink-muted">
                  {entry.member ? `${entry.member.emoji} ${entry.member.name}` : 'Someone'}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-xs text-ink-muted">
                  +{entry.effort}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          Points reflect how much effort a chore takes, so scrubbing the oven counts for more
          than taking a bin out.
        </p>
      </section>
    </div>
  );
}
