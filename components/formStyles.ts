/**
 * Shared form styling.
 *
 * One definition rather than the same class string copied into six components —
 * which is how inputs quietly drift out of alignment with each other as an app
 * grows, and the fastest way to make an interface look assembled rather than
 * designed.
 */

export const fieldClass =
  'tap w-full rounded-xl border border-line bg-sunk px-3.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand/40 focus:bg-surface';

export const labelClass = 'mb-2 block text-[13px] font-medium text-ink-muted';

/** Sits above a group of controls rather than labelling a single one. */
export const legendClass = 'mb-2.5 text-[13px] font-medium text-ink-muted';
