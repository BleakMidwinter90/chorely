'use client';

import { useActionState } from 'react';

import { joinHouseholdAction, type ActionState } from '@/app/actions';
import { AVATAR_EMOJI, EmojiField } from '@/components/EmojiField';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';

export function JoinForm({ joinCode, householdName }: { joinCode: string; householdName: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(joinHouseholdAction, {});

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <input type="hidden" name="joinCode" value={joinCode} />
      <FormError message={state.error} />

      <div>
        <label htmlFor="memberName" className="mb-2 block text-sm font-medium text-ink-muted">
          What&rsquo;s your name?
        </label>
        <input
          id="memberName"
          name="memberName"
          required
          maxLength={60}
          autoComplete="given-name"
          placeholder="Ben"
          className="tap w-full rounded-xl border border-line bg-surface-sunk px-4 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <EmojiField name="emoji" label="Pick yourself" options={AVATAR_EMOJI} />

      <SubmitButton className="w-full" pendingLabel="Joining…">
        Join {householdName}
      </SubmitButton>

      <p className="text-center text-xs text-ink-muted">
        No account needed. This device becomes you.
      </p>
    </form>
  );
}
