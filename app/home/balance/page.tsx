import { redirect } from 'next/navigation';

import { ActivityChart } from '@/components/ActivityChart';
import { BalanceMeter } from '@/components/BalanceMeter';
import { getIdentity } from '@/lib/auth/session';
import { describeBalance } from '@/lib/domain/fairness';
import { describeStreak } from '@/lib/domain/streaks';
import { getHouseholdBalance, getRecentActivity } from '@/lib/services/ledger';
import {
  getMemberStreak,
  getMostSkippedChores,
  getWeeklyActivity,
} from '@/lib/services/insights';
import { householdToday } from '@/lib/services/scheduling';

export const metadata = { title: 'Balance' };

/** Warm at the top, honest at the bottom, alarming nowhere. */
function scoreTone(balance: number): { label: string; className: string } {
  if (balance >= 90) return { label: 'Evenly split', className: 'text-brand' };
  if (balance >= 70) return { label: 'Roughly even', className: 'text-brand' };
  if (balance >= 45) return { label: 'A bit lopsided', className: 'text-late' };
  return { label: 'Lopsided', className: 'text-late' };
}

export default async function BalancePage() {
  const identity = await getIdentity();
  if (!identity) redirect('/');

  const { household, member: viewer } = identity;
  const today = householdToday(household);
  const [{ report, members, nameOf }, activity, weeks, streak, skipped] = await Promise.all([
    getHouseholdBalance(household, today),
    getRecentActivity(household, 20),
    getWeeklyActivity(household, today),
    getMemberStreak(household, viewer.id, today),
    getMostSkippedChores(household),
  ]);

  const streakLine = describeStreak(streak);

  const tone = scoreTone(report.balance);

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow mb-2">Last {household.fairnessWindowDays} days</p>
        <h1 className="display text-4xl sm:text-5xl">Balance</h1>
      </header>

      <section className="panel p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className={`display numeric text-7xl leading-none sm:text-8xl ${tone.className}`}>
              {Math.round(report.balance)}
            </p>
            <p className={`mt-3 text-[15px] font-medium ${tone.className}`}>{tone.label}</p>
          </div>
          <p className="eyebrow pt-2">out of 100</p>
        </div>

        <p className="mt-6 max-w-md text-[15px] text-pretty text-ink-muted">
          {describeBalance(report, nameOf)}
        </p>

        {streakLine && (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-muted">
            <span className="text-ink">You:</span> {streakLine}
          </p>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-4">Over time</h2>
        <ActivityChart weeks={weeks} />
      </section>

      <section>
        <h2 className="eyebrow mb-4">Who did what</h2>
        <BalanceMeter report={report} members={members} />
      </section>

      <section>
        <h2 className="eyebrow mb-4">Recent</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing finished yet.</p>
        ) : (
          <ul className="panel px-4">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 border-b border-line py-3 text-sm last:border-b-0"
              >
                <span aria-hidden className="text-[17px] leading-none">
                  {entry.chore.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.chore.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {entry.member ? `${entry.member.emoji} ${entry.member.name}` : 'Someone'}
                </span>
                <span className="numeric w-8 shrink-0 text-right text-xs text-ink-faint">
                  +{entry.effort}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 max-w-md text-xs text-pretty text-ink-faint">
          Points reflect how much effort a chore takes, so scrubbing the oven counts for more
          than taking a bin out.
        </p>
      </section>

      {skipped.length > 0 && (
        <section>
          <h2 className="eyebrow mb-4">Worth a conversation</h2>
          <ul className="panel px-4">
            {skipped.map((insight) => (
              <li
                key={insight.choreId}
                className="flex items-center gap-3 border-b border-line py-3 text-sm last:border-b-0"
              >
                <span aria-hidden className="text-[17px] leading-none">
                  {insight.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{insight.name}</span>
                <span className="numeric shrink-0 text-xs text-ink-faint">
                  skipped {insight.skipRate}% of the time
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-md text-xs text-pretty text-ink-faint">
            A chore the house keeps skipping is usually a chore the house doesn&rsquo;t need.
            Worth deciding on purpose rather than leaving it to be ignored every week.
          </p>
        </section>
      )}
    </div>
  );
}
