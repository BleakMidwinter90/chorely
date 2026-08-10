import { Check, X } from 'lucide-react';

import { completeChoreAction, skipChoreAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { daysOverdue } from '@/lib/domain/recurrence';
import type { IsoDate } from '@/lib/domain/types';
import type { AgendaItem } from '@/lib/services/households';

/**
 * How late something is, said the way a person would say it.
 *
 * Deliberately gentle. "3 days ago" is information; "OVERDUE" in red is a
 * telling-off, and an app that nags gets deleted.
 */
function whenLabel(item: AgendaItem, today: IsoDate): string {
  if (item.status === 'today') return 'Today';
  if (item.status === 'upcoming') {
    const days = daysOverdue(today, item.occurrence.dueOn);
    return days === 1 ? 'Tomorrow' : `In ${days} days`;
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
    <li className="group flex items-center gap-3 border-b border-line px-1 py-3 last:border-b-0">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-sunk text-[19px] leading-none"
      >
        {item.chore.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-snug">{item.chore.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-snug text-ink-faint">
          <span className={isLate ? 'font-medium text-late' : undefined}>
            {whenLabel(item, today)}
          </span>
          <span aria-hidden className="text-line-strong">
            /
          </span>
          <span className="truncate">
            {item.assignee
              ? isMine
                ? 'Your turn'
                : `${item.assignee.emoji} ${item.assignee.name}`
              : 'Anyone'}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <form action={skipChoreAction}>
          <input type="hidden" name="occurrenceId" value={item.occurrence.id} />
          <SubmitButton
            variant="quiet"
            size="sm"
            icon={<X size={15} strokeWidth={1.9} aria-hidden />}
            label={`Skip ${item.chore.name}`}
            title="Skip this one — nobody gets the credit"
            className="!px-2.5"
          >
            <span className="sr-only sm:not-sr-only">Skip</span>
          </SubmitButton>
        </form>

        <form action={completeChoreAction}>
          <input type="hidden" name="occurrenceId" value={item.occurrence.id} />
          <SubmitButton
            variant="affirm"
            size="sm"
            icon={<Check size={15} strokeWidth={2.1} aria-hidden />}
            label={`Mark ${item.chore.name} done`}
            title="I did this"
          >
            Done
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}
