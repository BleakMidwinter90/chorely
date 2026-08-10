import { Plane } from 'lucide-react';

import { setAwayAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { describeAway } from '@/lib/domain/away';
import type { IsoDate } from '@/lib/domain/types';

/** Lengths people actually go away for. A date picker is more work than this. */
const LENGTHS = [
  { days: 3, label: 'A long weekend' },
  { days: 7, label: 'A week' },
  { days: 14, label: 'Two weeks' },
  { days: 30, label: 'A month' },
];

/**
 * Going away.
 *
 * Two things happen, and the second is the one that matters. Chores stop being
 * assigned to you — obvious — and your expected share shrinks in proportion to
 * the days you were gone. Pausing assignment alone would leave you coming home
 * to an app announcing you were behind, which would be both false and precisely
 * the accusation this app exists not to make.
 */
export function AwayForm({
  awayFrom,
  awayUntil,
  today,
}: {
  awayFrom: string | null;
  awayUntil: string | null;
  today: IsoDate;
}) {
  const period = awayFrom && awayUntil ? { from: awayFrom, until: awayUntil } : null;
  const current = describeAway(period, today);

  if (current) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium">
            <Plane size={16} strokeWidth={1.8} aria-hidden className="text-ink-faint" />
            {current}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            No chores while you&rsquo;re gone, and the balance won&rsquo;t hold it against you.
          </p>
        </div>
        <form action={setAwayAction}>
          <input type="hidden" name="clear" value="1" />
          <SubmitButton variant="quiet" size="sm">
            I&rsquo;m back
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <p className="text-[15px] font-medium">Going away?</p>
      <p className="mt-1 text-sm text-pretty text-ink-muted">
        Your chores get handed to whoever&rsquo;s around, and the balance expects less of you
        while you&rsquo;re gone.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {LENGTHS.map((length) => (
          <form key={length.days} action={setAwayAction}>
            <input type="hidden" name="days" value={length.days} />
            <SubmitButton variant="quiet" size="sm">
              {length.label}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
