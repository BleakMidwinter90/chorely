'use client';

import { useActionState } from 'react';

import { joinHouseholdAction, type ActionState } from '@/app/actions';
import { AVATAR_EMOJI, EmojiField } from '@/components/EmojiField';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { fieldClass, labelClass } from '@/components/formStyles';

export function JoinForm({ joinCode, householdName }: { joinCode: string; householdName: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(joinHouseholdAction, {});

  return (
    <form action={formAction} className="panel space-y-6 p-6 sm:p-7">
      <input type="hidden" name="joinCode" value={joinCode} />
      <FormError message={state.error} />

      <div>
        <label htmlFor="memberName" className={labelClass}>
          What&rsquo;s your name?
        </label>
        <input
          id="memberName"
          name="memberName"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder="Ben"
          className={fieldClass}
        />
      </div>

      <EmojiField name="emoji" label="Pick yourself" options={AVATAR_EMOJI} />

      <SubmitButton className="w-full">Join {householdName}</SubmitButton>

      <p className="text-center text-xs text-ink-faint">
        No account needed. This device becomes you.
      </p>
    </form>
  );
}
