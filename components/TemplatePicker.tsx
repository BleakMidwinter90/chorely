'use client';

import { useState } from 'react';
import { ListPlus } from 'lucide-react';

import { addTemplateChoresAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { CHORE_TEMPLATES } from '@/lib/domain/choreTemplates';

/**
 * Pick chores from a list instead of inventing them.
 *
 * Setting up is where households abandon a chore app: the empty screen asks you
 * to do the hardest part — remember everything your home needs — before the app
 * has earned any trust. Ticking boxes is a different and far easier task, and
 * the list doubles as a prompt for the jobs nobody thinks to write down.
 */
export function TemplatePicker({ existingNames }: { existingNames: string[] }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  const already = new Set(existingNames.map((name) => name.toLowerCase()));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface px-4 text-sm font-medium text-ink-muted transition-colors hover:border-brand/40 hover:text-ink"
      >
        <ListPlus size={16} strokeWidth={1.9} aria-hidden />
        Pick from common chores
      </button>
    );
  }

  return (
    <form
      action={addTemplateChoresAction}
      onChange={(event) => {
        const form = event.currentTarget;
        setCount(form.querySelectorAll<HTMLInputElement>('input[name="template"]:checked').length);
      }}
      className="panel space-y-6 p-5 sm:p-6"
    >
      <div>
        <h2 className="display text-xl">Common chores</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Tick anything your home needs. Effort and timing are set sensibly and can be changed
          after.
        </p>
      </div>

      {CHORE_TEMPLATES.map((group) => (
        <fieldset key={group.room}>
          <legend className="eyebrow mb-2.5">{group.room}</legend>
          <div className="flex flex-wrap gap-1.5">
            {group.chores.map((chore) => {
              const exists = already.has(chore.name.toLowerCase());
              return (
                <label
                  key={chore.name}
                  className={`tap flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm transition-colors ${
                    exists
                      ? 'cursor-not-allowed border-line bg-sunk text-ink-faint'
                      : 'border-line bg-sunk has-checked:border-brand/40 has-checked:bg-brand-soft has-checked:text-brand-ink'
                  }`}
                  // Already added is stated rather than hidden, so the list stays
                  // a complete picture of what a home might need.
                  title={exists ? 'Already on your list' : undefined}
                >
                  <input
                    type="checkbox"
                    name="template"
                    value={chore.name}
                    disabled={exists}
                    className="sr-only"
                  />
                  <span aria-hidden>{chore.icon}</span>
                  {chore.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton className="flex-1 sm:flex-none">
          {count > 0 ? `Add ${count} ${count === 1 ? 'chore' : 'chores'}` : 'Add chores'}
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
