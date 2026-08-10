import type { Member } from '@/lib/db/schema';
import type { BalanceReport } from '@/lib/domain/fairness';

interface BalanceMeterProps {
  report: BalanceReport;
  members: Member[];
}

/**
 * Who did what, as a single proportional bar.
 *
 * A stacked bar rather than a leaderboard, deliberately. A ranked list invites
 * a winner and a loser; a bar just shows the shape of the split, and the
 * household can draw its own conclusion.
 */
export function BalanceMeter({ report, members }: BalanceMeterProps) {
  const byId = new Map(members.map((member) => [member.id, member]));

  // A fixed, colourblind-safe sequence. Assigned by join order so a person's
  // colour never changes underneath them.
  const palette = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899', '#64748b'];
  const colorFor = (memberId: string) => {
    const index = members.findIndex((member) => member.id === memberId);
    return palette[(index < 0 ? 0 : index) % palette.length];
  };

  const ordered = [...report.members].sort((a, b) => b.points - a.points);

  if (report.totalPoints === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="mb-2 text-3xl">🫧</p>
        <p className="text-sm text-ink-muted">
          Nothing logged in the last {report.members.length > 0 ? 'few weeks' : 'while'}. Tick a
          few chores off and the split will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full bg-surface-sunk"
        role="img"
        aria-label={ordered
          .map((load) => `${byId.get(load.memberId)?.name ?? 'Someone'} ${Math.round(load.sharePct)}%`)
          .join(', ')}
      >
        {ordered.map((load) => (
          <div
            key={load.memberId}
            style={{ width: `${load.sharePct}%`, background: colorFor(load.memberId) }}
            className="h-full"
          />
        ))}
      </div>

      <ul className="space-y-2">
        {ordered.map((load) => {
          const member = byId.get(load.memberId);
          // Half a point of drift is rounding, not unfairness.
          const drift = Math.round(load.delta * 10) / 10;
          return (
            <li key={load.memberId} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: colorFor(load.memberId) }}
              />
              <span className="min-w-0 flex-1 truncate">
                {member?.emoji} {member?.name ?? 'Someone who left'}
              </span>
              <span className="tabular-nums text-ink-muted">{Math.round(load.sharePct)}%</span>
              <span
                className={`w-20 text-right tabular-nums text-xs ${
                  Math.abs(drift) < 1 ? 'text-ink-muted' : drift > 0 ? 'text-accent' : 'text-late'
                }`}
              >
                {Math.abs(drift) < 1
                  ? 'on target'
                  : drift > 0
                    ? `+${drift} ahead`
                    : `${Math.abs(drift)} behind`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
