import { updateReminderPrefsAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { fieldClass } from '@/components/formStyles';

/** Sensible waking hours. A 24-entry dropdown is a worse experience than six. */
const HOURS = [6, 7, 8, 9, 10, 12, 17, 18, 19, 20];

function formatHour(hour: number): string {
  if (hour === 12) return 'midday';
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/**
 * When this person wants to hear from chorely.
 *
 * Per member, not per household: one person is up at six and another would
 * rather not be spoken to until the evening.
 */
export function ReminderTimeForm({ enabled, hour }: { enabled: boolean; hour: number }) {
  return (
    <form action={updateReminderPrefsAction} className="panel space-y-4 p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="remindersEnabled"
          defaultChecked={enabled}
          className="mt-0.5 size-4 accent-[var(--brand)]"
        />
        <span className="text-sm">
          Remind me about my chores
          <span className="mt-0.5 block text-xs text-ink-faint">
            At most once a day, and never when your list is empty.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="reminderHour" className="text-sm text-ink-muted">
          Around
        </label>
        <select
          id="reminderHour"
          name="reminderHour"
          defaultValue={hour}
          className={`${fieldClass} w-auto`}
        >
          {HOURS.map((option) => (
            <option key={option} value={option}>
              {formatHour(option)}
            </option>
          ))}
        </select>
        <SubmitButton variant="quiet" size="sm" className="ml-auto">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
