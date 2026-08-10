/**
 * An inline problem message.
 *
 * Amber rather than red, and phrased as a fact rather than a scolding — the
 * same restraint the rest of the app uses about late chores.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="rounded-xl bg-late-soft px-4 py-3 text-sm text-late">
      {message}
    </p>
  );
}
