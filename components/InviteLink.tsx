'use client';

import { useState } from 'react';

/**
 * The invite link, with a copy button.
 *
 * This link *is* the access control: anyone holding it can join the household.
 * That is stated plainly next to it rather than buried, because it is the one
 * security property a user needs to understand.
 */
export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // link is selectable on screen, so this is a lost convenience, not a
      // lost capability — no error dialog required.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Invite link"
          className="tap min-w-0 flex-1 rounded-xl border border-line bg-surface-sunk px-4 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="button"
          onClick={copy}
          className="tap shrink-0 cursor-pointer rounded-xl bg-accent px-4 text-sm font-medium text-white transition hover:opacity-90 dark:text-stone-950"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        Anyone with this link can join your home and see its chores. Share it the way you&rsquo;d
        share a house key.
      </p>
    </div>
  );
}
