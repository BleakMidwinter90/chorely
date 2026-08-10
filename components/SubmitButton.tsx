'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'quiet' | 'affirm';
  size?: 'md' | 'sm';
  /**
   * A rendered icon element, not an icon component.
   *
   * Server Components render these and hand the element across the boundary;
   * a component function could not cross it, because React cannot serialise a
   * function.
   */
  icon?: ReactNode;
  title?: string;
  /** Screen-reader label, for buttons whose visible text is only an icon. */
  label?: string;
}

const VARIANTS = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover font-medium',
  quiet: 'border border-line text-ink-muted hover:border-line-strong hover:text-ink',
  affirm: 'border border-transparent bg-brand-soft text-brand-ink font-medium hover:border-brand/25',
} as const;

const SIZES = {
  md: 'tap px-4 text-sm',
  sm: 'h-9 px-3 text-[13px]',
} as const;

/**
 * A submit button that disables itself while its form is in flight.
 *
 * Not decoration. The primary interaction in this app is "tap Done", and a
 * double-tap on a slow phone connection is the likeliest way to double-post.
 */
export function SubmitButton({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  icon,
  title,
  label,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={label}
      aria-busy={pending}
      className={`inline-flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-full transition-colors disabled:cursor-wait disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {pending ? (
        <Loader2 size={15} strokeWidth={2} aria-hidden className="animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
