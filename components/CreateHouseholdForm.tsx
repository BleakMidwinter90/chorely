'use client';

import { useActionState } from 'react';

import { createHouseholdAction, type ActionState } from '@/app/actions';
import { AVATAR_EMOJI, EmojiField } from '@/components/EmojiField';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { TimezoneField } from '@/components/TimezoneField';

const inputClass =
  'tap w-full rounded-xl border border-line bg-surface-sunk px-4 text-base outline-none focus:ring-2 focus:ring-accent';

export function CreateHouseholdForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createHouseholdAction, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <TimezoneField />
      <FormError message={state.error} />

      <div>
        <label htmlFor="householdName" className="mb-2 block text-sm font-medium text-ink-muted">
          What should we call your home?
        </label>
        <input
          id="householdName"
          name="householdName"
          required
          maxLength={60}
          autoComplete="off"
          placeholder="Flat 3B"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="memberName" className="mb-2 block text-sm font-medium text-ink-muted">
          And your name?
        </label>
        <input
          id="memberName"
          name="memberName"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder="Ana"
          className={inputClass}
        />
      </div>

      <EmojiField name="emoji" label="Pick yourself" options={AVATAR_EMOJI} />

      <SubmitButton className="w-full" pendingLabel="Setting things up…">
        Create my home
      </SubmitButton>

      <p className="text-center text-xs text-ink-muted">
        No account, no email, no password. You&rsquo;ll get a link to share with everyone you live
        with.
      </p>
    </form>
  );
}
