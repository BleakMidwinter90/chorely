'use client';

import { useActionState, useState } from 'react';

import { Plus } from 'lucide-react';

import { createChoreAction, type ActionState } from '@/app/actions';
import { CHORE_EMOJI, EmojiField } from '@/components/EmojiField';
import { FormError } from '@/components/FormError';
import { fieldClass as inputClass, labelClass, legendClass } from '@/components/formStyles';
import { SubmitButton } from '@/components/SubmitButton';
import type { Member } from '@/lib/db/schema';

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;

const EFFORT_LABELS = ['', 'A minute', 'Quick', 'Some work', 'A real job', 'The worst one'];


/**
 * Adding a chore.
 *
 * Collapsed by default so the page reads as "here are your chores" rather than
 * "here is a form". The scheduling options are phrased as questions about the
 * chore rather than as recurrence rules — nobody thinks of the bathroom in
 * terms of anchor dates.
 */
export function NewChoreForm({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [repeat, setRepeat] = useState<'days' | 'weekly' | 'monthly' | 'once'>('days');
  const [rotationMode, setRotationMode] = useState<'fair' | 'rotate' | 'fixed' | 'anyone'>('fair');
  const [effort, setEffort] = useState(2);
  const [state, formAction] = useActionState<ActionState, FormData>(createChoreAction, {});

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface px-4 text-sm font-medium text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
        Add a chore
      </button>
    );
  }

  return (
    <form action={formAction} className="panel space-y-6 p-5 sm:p-6">
      <FormError message={state.error} />
      <div>
        <label htmlFor="name" className={labelClass}>
          What needs doing?
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          autoFocus
          autoComplete="off"
          placeholder="Clean the bathroom"
          className={inputClass}
        />
      </div>

      <EmojiField name="icon" label="Icon" options={CHORE_EMOJI} />

      <div>
        <label htmlFor="effort" className={labelClass}>
          How big a job is it?{' '}
          <span className="font-normal text-ink">{EFFORT_LABELS[effort]}</span>
        </label>
        <input
          id="effort"
          name="effort"
          type="range"
          min={1}
          max={5}
          step={1}
          value={effort}
          onChange={(event) => setEffort(Number(event.target.value))}
          className="w-full accent-[var(--brand)]"
        />
        <p className="mt-1 text-xs text-ink-muted">
          Bigger jobs count for more when working out who&rsquo;s pulling their weight.
        </p>
      </div>

      <fieldset>
        <legend className={legendClass}>How often?</legend>
        <select
          name="repeat"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value as typeof repeat)}
          className={inputClass}
        >
          <option value="days">Every so many days</option>
          <option value="weekly">On certain days of the week</option>
          <option value="monthly">Once a month</option>
          <option value="once">Just the once</option>
        </select>

        {repeat === 'days' && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">Every</span>
              <input
                name="days"
                type="number"
                min={1}
                max={365}
                defaultValue={7}
                className="tap w-20 rounded-xl border border-line bg-sunk px-3 text-center text-[15px] outline-none transition-colors focus:border-brand/40 focus:bg-surface"
              />
              <span className="text-sm text-ink-muted">days</span>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                name="flexible"
                type="checkbox"
                defaultChecked
                className="mt-0.5 size-4 accent-[var(--brand)]"
              />
              <span>
                Count from when it was last done
                <span className="mt-0.5 block text-xs text-ink-muted">
                  On for things like cleaning the shower, where the clock restarts when you
                  actually do it. Off for fixed jobs like bins, which come round on schedule
                  whether or not last week happened.
                </span>
              </span>
            </label>
          </div>
        )}

        {repeat === 'weekly' && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <label
                key={day.value}
                className="tap flex cursor-pointer items-center rounded-xl border border-line bg-sunk px-3.5 text-sm transition-colors has-checked:border-brand/40 has-checked:bg-brand-soft has-checked:text-brand-ink"
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={day.value}
                  defaultChecked={day.value === 1}
                  className="sr-only"
                />
                {day.label}
              </label>
            ))}
          </div>
        )}

        {repeat === 'monthly' && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-ink-muted">On day</span>
            <input
              name="dayOfMonth"
              type="number"
              min={1}
              max={31}
              defaultValue={1}
              className="tap w-20 rounded-xl border border-line bg-sunk px-3 text-center text-[15px] outline-none transition-colors focus:border-brand/40 focus:bg-surface"
            />
            <span className="text-sm text-ink-muted">of the month</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className={legendClass}>Whose job is it?</legend>
        <select
          name="rotationMode"
          value={rotationMode}
          onChange={(event) => setRotationMode(event.target.value as typeof rotationMode)}
          className={inputClass}
        >
          <option value="fair">Whoever has done least lately</option>
          <option value="rotate">Take turns in order</option>
          <option value="fixed">Always the same person</option>
          <option value="anyone">Anyone — first come</option>
        </select>

        {rotationMode === 'fixed' && (
          <select name="fixedMemberId" className={`${inputClass} mt-3`} required>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.emoji} {member.name}
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <div className="flex gap-2">
        <SubmitButton className="flex-1">
          Add chore
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="tap cursor-pointer rounded-full border border-line px-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
