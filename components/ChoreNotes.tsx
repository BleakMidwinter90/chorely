'use client';

import { useState } from 'react';
import { NotebookPen } from 'lucide-react';

import { updateChoreNotesAction } from '@/app/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { fieldClass } from '@/components/formStyles';

/**
 * A note attached to a chore.
 *
 * For the practical knowledge that otherwise lives in one person's head — where
 * the hoover bags are kept, which bin goes out this week, that the machine needs
 * the door left open. That knowledge is a genuine reason chores end up unevenly
 * distributed: it is much easier to keep doing a job yourself than to explain it,
 * and so one person quietly owns it forever.
 */
export function ChoreNotes({ choreId, notes }: { choreId: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink"
      >
        <NotebookPen size={13} strokeWidth={1.7} aria-hidden />
        {notes ? notes : 'Add a note'}
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await updateChoreNotesAction(formData);
        setEditing(false);
      }}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="choreId" value={choreId} />
      <label className="sr-only" htmlFor={`notes-${choreId}`}>
        Note for this chore
      </label>
      <input
        id={`notes-${choreId}`}
        name="notes"
        defaultValue={notes ?? ''}
        maxLength={500}
        autoFocus
        placeholder="Hoover bags are under the stairs"
        className={`${fieldClass} flex-1 text-[13px]`}
      />
      <SubmitButton variant="quiet" size="sm">
        Save
      </SubmitButton>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="cursor-pointer text-xs text-ink-faint transition-colors hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}
