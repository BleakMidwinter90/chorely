'use client';

import { useActionState } from 'react';

import { createHouseholdAction, type ActionState } from '@/app/actions';
import { AVATAR_EMOJI, EmojiField } from '@/components/EmojiField';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { TimezoneField } from '@/components/TimezoneField';
import { fieldClass, labelClass } from '@/components/formStyles';

export function CreateHouseholdForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createHouseholdAction, {});

  return (
    <form action={formAction} className="panel space-y-6 p-6 sm:p-7">
      <TimezoneField />

      <div>
        <h2 className="display text-2xl">Start a home</h2>
        <p className="mt-1.5 text-sm text-ink-muted">Takes about twenty seconds.</p>
      </div>

      <FormError message={state.error} />

      <div>
        <label htmlFor="householdName" className={labelClass}>
          What should we call your home?
        </label>
        <input
          id="householdName"
          name="householdName"
          required
          maxLength={60}
          autoComplete="off"
          placeholder="Flat 3B"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="memberName" className={labelClass}>
          And your name?
        </label>
        <input
          id="memberName"
          name="memberName"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder="Ana"
          className={fieldClass}
        />
      </div>

      <EmojiField name="emoji" label="Pick yourself" options={AVATAR_EMOJI} />

      <SubmitButton className="w-full">Create my home</SubmitButton>

      <p className="text-center text-xs leading-relaxed text-ink-faint">
        No account, no email, no password. You&rsquo;ll get a link to share with everyone you
        live with.
      </p>
    </form>
  );
}
