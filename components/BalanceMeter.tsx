import type { Member } from '@/lib/db/schema';
import type { BalanceReport } from '@/lib/domain/fairness';

interface BalanceMeterProps {
  report: BalanceReport;
  members: Member[];
}

/**
 * Assigned by join order, so a person's colour never changes underneath them.
 *
 * Chosen to stay distinguishable under the common forms of colour blindness and
 * to sit alongside the pine brand rather than fight it — muted and slightly
 * earthy, none of them the saturated primaries a framework palette hands you.
 */
const PALETTE = ['#3f7d6c', '#c98a3d', '#5b6ea8', '#a35d78', '#7a8b4a', '#8a7f74'];

/**
 * Who did what, as a single proportional bar.
 *
 * A bar rather than a leaderboard, deliberately. A ranked list invites a winner
 * and a loser; a bar just shows the shape of the split and lets the household
 * draw its own conclusion.
 */
export function BalanceMeter({ report, members }: BalanceMeterProps) {
  const byId = new Map(members.map((member) => [member.id, member]));

  // Resolved once into a lookup rather than scanning the roster per member.
  const colorById = new Map(
    members.map((member, index) => [member.id, PALETTE[index % PALETTE.length]]),
  );
  const colorFor = (memberId: string) => colorById.get(memberId) ?? PALETTE[0];

  const ordered = [...report.members].sort((a, b) => b.points - a.points);

  if (report.totalPoints === 0) {
    return (
      <div className="panel px-6 py-10 text-center">
        <p className="display text-xl">Nothing logged yet</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-pretty text-ink-muted">
          Tick a few chores off and the split will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={ordered
          .map(
            (load) =>
              `${byId.get(load.memberId)?.name ?? 'Someone'} ${Math.round(load.sharePct)} percent`,
          )
          .join(', ')}
      >
        {ordered.map((load) => (
          <div
            key={load.memberId}
            style={{ width: `${load.sharePct}%`, background: colorFor(load.memberId) }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      <ul className="mt-5 space-y-3">
        {ordered.map((load) => {
          const member = byId.get(load.memberId);
          // Under a point of drift is rounding, not unfairness.
          const drift = Math.round(load.delta * 10) / 10;
          const onTarget = Math.abs(drift) < 1;

          return (
            <li key={load.memberId} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: colorFor(load.memberId) }}
              />
              <span className="min-w-0 flex-1 truncate">
                {member?.emoji} {member?.name ?? 'Someone who left'}
              </span>
              <span className="numeric shrink-0 text-ink-muted">{Math.round(load.sharePct)}%</span>
              <span
                className={`numeric w-[4.5rem] shrink-0 text-right text-xs ${
                  onTarget ? 'text-ink-faint' : drift > 0 ? 'text-brand' : 'text-late'
                }`}
              >
                {onTarget ? 'on target' : drift > 0 ? `+${drift} ahead` : `${drift} behind`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
