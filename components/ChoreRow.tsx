import { completeChoreAction, skipChoreAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { daysOverdue } from '@/lib/domain/recurrence';
import type { IsoDate } from '@/lib/domain/types';
import type { AgendaItem } from '@/lib/services/households';

/**
 * How late something is, said the way a person would say it.
 *
 * Deliberately gentle. "3 days late" is information; "OVERDUE" in red is a
 * telling-off, and an app that nags gets deleted.
 */
function whenLabel(item: AgendaItem, today: IsoDate): string {
  if (item.status === 'today') return 'Today';
  if (item.status === 'upcoming') {
    const days = daysOverdue(today, item.occurrence.dueOn);
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  }
  const late = daysOverdue(item.occurrence.dueOn, today);
  if (late === 1) return 'Yesterday';
  if (late < 7) return `${late} days ago`;
  if (late < 14) return 'Over a week ago';
  return 'A while ago';
}

interface ChoreRowProps {
  item: AgendaItem;
  today: IsoDate;
  /** The person looking at the screen, so we can say "your turn". */
  viewerId: string;
}

export function ChoreRow({ item, today, viewerId }: ChoreRowProps) {
  const isMine = item.assignee?.id === viewerId;
  const isLate = item.status === 'overdue';

  return (
    <li className="card flex items-center gap-3 p-3">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-sunk text-xl">
        {item.chore.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.chore.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span className={isLate ? 'font-medium text-late' : undefined}>
            {whenLabel(item, today)}
          </span>
          <span aria-hidden>·</span>
          <span>
            {item.assignee
              ? isMine
                ? 'Your turn'
                : `${item.assignee.emoji} ${item.assignee.name}`
              : 'Anyone'}
          </span>
        </p>
      </div>

      <form action={skipChoreAction}>
        <input type="hidden" name="occurrenceId" value={item.occurrence.id} />
        <SubmitButton variant="quiet" className="px-3" title="Skip this one — nobody gets credit">
          Skip
        </SubmitButton>
      </form>

      <form action={completeChoreAction}>
        <input type="hidden" name="occurrenceId" value={item.occurrence.id} />
        <SubmitButton variant="done" pendingLabel="…" title="I did this">
          Done
        </SubmitButton>
      </form>
    </li>
  );
}
