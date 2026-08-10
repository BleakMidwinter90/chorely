'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Check, Plus, Trash2, Undo2 } from 'lucide-react';

import {
  addShoppingItemAction,
  clearBoughtItemsAction,
  removeShoppingItemAction,
  toggleShoppingItemAction,
} from '@/app/actions';
import type { ShoppingEntry } from '@/lib/services/shopping';

/** The shape the list is rendered from, flattened out of the DB rows. */
interface Row {
  id: string;
  name: string;
  note: string | null;
  bought: boolean;
  addedBy: string | null;
  boughtBy: string | null;
  /** True while the server has not yet confirmed it. */
  pending?: boolean;
}

function toRow(entry: ShoppingEntry): Row {
  return {
    id: entry.item.id,
    name: entry.item.name,
    note: entry.item.note,
    bought: Boolean(entry.item.boughtAt),
    addedBy: entry.addedBy?.name ?? null,
    boughtBy: entry.boughtBy?.name ?? null,
  };
}

type Optimistic =
  | { kind: 'add'; name: string }
  | { kind: 'toggle'; id: string; bought: boolean }
  | { kind: 'remove'; id: string }
  | { kind: 'clearBought' };

/**
 * The shared list.
 *
 * Everything here is optimistic. This screen gets used one-handed while pushing
 * a trolley, on whatever signal a supermarket has, and a tick that waits for a
 * round trip before it moves feels broken — people tap again, and then they
 * stop trusting it. React reconciles against the server's answer when it lands.
 */
export function ShoppingList({ needed, bought }: { needed: ShoppingEntry[]; bought: ShoppingEntry[] }) {
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState('');

  const rows = [...needed.map(toRow), ...bought.map(toRow)];

  const [optimisticRows, applyOptimistic] = useOptimistic(rows, (current, action: Optimistic) => {
    switch (action.kind) {
      case 'add':
        return [
          ...current,
          {
            // Temporary id; the server assigns the real one. Only ever used as
            // a React key for the instant between tap and confirmation.
            id: `pending-${action.name}-${current.length}`,
            name: action.name,
            note: null,
            bought: false,
            addedBy: null,
            boughtBy: null,
            pending: true,
          },
        ];
      case 'toggle':
        return current.map((row) =>
          row.id === action.id ? { ...row, bought: action.bought } : row,
        );
      case 'remove':
        return current.filter((row) => row.id !== action.id);
      case 'clearBought':
        return current.filter((row) => !row.bought);
    }
  });

  const stillNeeded = optimisticRows.filter((row) => !row.bought);
  const inTrolley = optimisticRows.filter((row) => row.bought);

  function submitNew(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;

    // Clear immediately so the next item can be typed without waiting.
    setDraft('');
    startTransition(async () => {
      applyOptimistic({ kind: 'add', name });
      await addShoppingItemAction(formData);
    });
  }

  function toggle(id: string, bought: boolean) {
    startTransition(async () => {
      applyOptimistic({ kind: 'toggle', id, bought });
      const formData = new FormData();
      formData.set('itemId', id);
      formData.set('bought', bought ? '1' : '0');
      await toggleShoppingItemAction(formData);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      applyOptimistic({ kind: 'remove', id });
      const formData = new FormData();
      formData.set('itemId', id);
      await removeShoppingItemAction(formData);
    });
  }

  return (
    <div className="space-y-8">
      <form action={submitNew} className="flex gap-2">
        <input
          name="name"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add something…"
          maxLength={80}
          autoComplete="off"
          aria-label="Add an item to the list"
          className="tap min-w-0 flex-1 rounded-xl border border-line bg-sunk px-3.5 text-[15px] outline-none transition-colors placeholder:text-ink-faint focus:border-brand/40 focus:bg-surface"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Add item"
          className="tap inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          Add
        </button>
      </form>

      <section>
        <h2 className="eyebrow mb-3">
          {stillNeeded.length === 0 ? 'Nothing needed' : `Needed · ${stillNeeded.length}`}
        </h2>

        {stillNeeded.length === 0 ? (
          <div className="panel px-6 py-10 text-center">
            <p className="display text-xl">The list is empty</p>
            <p className="mt-2 text-sm text-ink-muted">
              Add anything the house runs out of and everyone will see it.
            </p>
          </div>
        ) : (
          <ul className="panel px-4">
            {stillNeeded.map((row) => (
              <li key={row.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(row.id, true)}
                  disabled={row.pending}
                  aria-label={`Mark ${row.name} as bought`}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border border-line-strong transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-40"
                />
                <span className={`min-w-0 flex-1 text-[15px] ${row.pending ? 'opacity-50' : ''}`}>
                  {row.name}
                  {row.note && <span className="ml-2 text-xs text-ink-faint">{row.note}</span>}
                </span>
                {row.addedBy && (
                  <span className="shrink-0 text-xs text-ink-faint">{row.addedBy}</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  disabled={row.pending}
                  aria-label={`Remove ${row.name}`}
                  className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:text-late disabled:opacity-40"
                >
                  <Trash2 size={15} strokeWidth={1.7} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inTrolley.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="eyebrow">In the trolley · {inTrolley.length}</h2>
            <form
              action={() =>
                startTransition(async () => {
                  applyOptimistic({ kind: 'clearBought' });
                  await clearBoughtItemsAction();
                })
              }
            >
              <button
                type="submit"
                className="cursor-pointer text-xs text-ink-faint underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
              >
                Clear
              </button>
            </form>
          </div>

          <ul className="panel px-4">
            {inTrolley.map((row) => (
              <li key={row.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink"
                >
                  <Check size={14} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-ink-faint line-through">
                  {row.name}
                </span>
                {row.boughtBy && (
                  <span className="shrink-0 text-xs text-ink-faint">{row.boughtBy}</span>
                )}
                <button
                  type="button"
                  onClick={() => toggle(row.id, false)}
                  aria-label={`Put ${row.name} back on the list`}
                  className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-faint transition-colors hover:text-ink"
                >
                  <Undo2 size={15} strokeWidth={1.7} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
