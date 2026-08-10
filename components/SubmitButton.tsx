'use client';

import { useFormStatus } from 'react-dom';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  variant?: 'primary' | 'quiet' | 'done';
  title?: string;
}

const VARIANTS = {
  primary:
    'bg-accent text-white dark:text-stone-950 hover:opacity-90 disabled:opacity-60 font-medium',
  quiet:
    'bg-surface-sunk text-ink-muted hover:text-ink border border-line disabled:opacity-60',
  done: 'bg-accent-soft text-accent-ink hover:brightness-95 disabled:opacity-60 font-medium',
} as const;

/**
 * A submit button that disables itself while its form is in flight.
 *
 * Not decoration: the primary interaction is "tap done", and a double-tap on a
 * slow phone connection is the single most likely way to double-post.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = '',
  variant = 'primary',
  title,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-busy={pending}
      className={`tap inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm transition disabled:cursor-wait ${VARIANTS[variant]} ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
