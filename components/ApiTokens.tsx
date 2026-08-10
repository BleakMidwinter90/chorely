'use client';

import { useActionState, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';

import { createApiTokenAction, revokeApiTokenAction, type TokenState } from '@/app/actions';
import { FormError } from '@/components/FormError';
import { SubmitButton } from '@/components/SubmitButton';
import { fieldClass } from '@/components/formStyles';

export interface TokenSummary {
  prefix: string;
  name: string;
  lastUsedAt: Date | null;
}

/**
 * Long-lived tokens for scripts, dashboards and native clients.
 *
 * The plaintext is shown exactly once. Only a SHA-256 hash is stored, so there
 * is genuinely no way to show it again — which is stated plainly rather than
 * left for someone to discover after they close the panel.
 */
export function ApiTokens({ tokens }: { tokens: TokenSummary[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<TokenState, FormData>(createApiTokenAction, {});

  return (
    <div className="panel space-y-4 p-5">
      <div>
        <h3 className="flex items-center gap-2 text-[15px] font-medium">
          <KeyRound size={16} strokeWidth={1.8} aria-hidden className="text-ink-faint" />
          API access
        </h3>
        <p className="mt-1 text-sm text-pretty text-ink-muted">
          For scripts, a wall tablet, or anything else you want to wire up yourself. A token
          covers this household.
        </p>
      </div>

      {state.token && (
        <div className="rounded-xl bg-brand-soft p-3.5">
          <p className="text-[13px] font-medium text-brand-ink">
            Copy this now — it can&rsquo;t be shown again.
          </p>
          <code className="mt-2 block break-all font-mono text-[12px] text-brand-ink">
            {state.token}
          </code>
        </div>
      )}

      <FormError message={state.error} />

      {tokens.length > 0 && (
        <ul className="divide-y divide-line">
          {tokens.map((token) => (
            <li key={token.prefix} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{token.name}</span>
              <code className="shrink-0 font-mono text-[11px] text-ink-faint">
                {token.prefix}…
              </code>
              <span className="shrink-0 text-xs text-ink-faint">
                {token.lastUsedAt ? 'used' : 'never used'}
              </span>
              <form action={revokeApiTokenAction}>
                <input type="hidden" name="prefix" value={token.prefix} />
                <SubmitButton
                  variant="quiet"
                  size="sm"
                  icon={<Trash2 size={14} strokeWidth={1.7} aria-hidden />}
                  label={`Revoke ${token.name}`}
                  className="!px-2.5"
                >
                  <span className="sr-only" />
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form action={formAction} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="token-name">
            What is this token for?
          </label>
          <input
            id="token-name"
            name="name"
            required
            maxLength={60}
            autoFocus
            placeholder="Kitchen tablet"
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <SubmitButton size="sm">Create</SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="cursor-pointer px-2 text-sm text-ink-faint transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Create a token
        </button>
      )}
    </div>
  );
}
