import type { WeekActivity } from '@/lib/services/insights';

/**
 * Household effort, week by week.
 *
 * A single series, so there is no legend — the heading names it — and no
 * categorical palette to validate. The one colour check that applies is
 * contrast against the surface, which the brand pine clears in both themes.
 * Its low chroma is deliberate: it is the identity, and there is no second
 * series it could ever be confused with.
 *
 * Empty weeks are drawn as empty, not omitted. A chart that silently skips
 * quiet weeks compresses time and makes a fortnight of nothing look like
 * steady work — which, in an app about honest accounting, would be a lie.
 */
export function ActivityChart({ weeks }: { weeks: WeekActivity[] }) {
  const peak = Math.max(...weeks.map((week) => week.points), 1);
  const total = weeks.reduce((sum, week) => sum + week.points, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-ink-muted">Nothing logged in the last {weeks.length} weeks.</p>
    );
  }

  const label = (weekStart: string) => {
    const date = new Date(`${weekStart}T00:00:00Z`);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(date);
  };

  return (
    <figure className="panel p-5">
      <div className="flex h-32 items-end gap-[2px]" role="presentation">
        {weeks.map((week, index) => {
          const height = (week.points / peak) * 100;
          const isLast = index === weeks.length - 1;

          return (
            <div key={week.weekStart} className="group relative flex flex-1 flex-col justify-end">
              {/* A faint track keeps an empty week hoverable and legible as zero. */}
              <div className="absolute inset-x-0 bottom-0 top-0 rounded-t bg-sunk/60" aria-hidden />
              <div
                // Anchored to the baseline with rounded data-ends, per the mark spec.
                className={`relative rounded-t transition-[height] ${
                  isLast ? 'bg-brand' : 'bg-brand/55'
                }`}
                style={{ height: `${Math.max(height, week.points > 0 ? 4 : 0)}%` }}
                title={`Week of ${label(week.weekStart)}: ${week.points} ${
                  week.points === 1 ? 'point' : 'points'
                } across ${week.chores} ${week.chores === 1 ? 'chore' : 'chores'}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-[2px]" aria-hidden>
        {weeks.map((week, index) => (
          <span
            key={week.weekStart}
            className="flex-1 text-center text-[10px] text-ink-faint"
          >
            {/* Every other label only — eight dates in a row is noise. */}
            {index % 2 === weeks.length % 2 ? label(week.weekStart) : ''}
          </span>
        ))}
      </div>

      <figcaption className="mt-3 flex items-baseline justify-between gap-4 text-xs text-ink-faint">
        <span>Effort points per week</span>
        <span className="numeric">
          {weeks[weeks.length - 1].points} this week
        </span>
      </figcaption>

      {/* The same data as text, for screen readers and anyone who would rather read it. */}
      <table className="sr-only">
        <caption>Effort points completed per week</caption>
        <thead>
          <tr>
            <th scope="col">Week beginning</th>
            <th scope="col">Points</th>
            <th scope="col">Chores</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.weekStart}>
              <th scope="row">{label(week.weekStart)}</th>
              <td>{week.points}</td>
              <td>{week.chores}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
