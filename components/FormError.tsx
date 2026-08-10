import { Info } from 'lucide-react';

/**
 * An inline problem message.
 *
 * Ochre rather than red, and phrased as a fact rather than a scolding — the
 * same restraint the rest of the app shows about late chores.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-xl bg-late-soft px-3.5 py-3 text-[13px] leading-relaxed text-late"
    >
      <Info size={15} strokeWidth={1.9} aria-hidden className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
