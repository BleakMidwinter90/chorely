/**
 * Nudging: asking a housemate about a chore without it becoming nagging.
 *
 * This is the most socially dangerous feature in the app. A reminder button is
 * one design decision away from a device for passive aggression, so the rules
 * are strict and they live here, pure and tested, rather than being scattered
 * through a route handler.
 */

import type { IsoDate } from './types';

export interface NudgeRequest {
  /** Whoever is pressing the button. */
  fromMemberId: string;
  /** Whoever the chore currently belongs to. Null when it is unassigned. */
  assigneeId: string | null;
  /** When the chore is due. */
  dueOn: IsoDate;
  /** Date of the last nudge about this same occurrence, from anyone. */
  lastNudgedOn?: IsoDate;
}

export type NudgeRefusal =
  | 'unassigned'
  | 'self'
  | 'not-due-yet'
  | 'already-nudged-today';

export type NudgeVerdict = { allowed: true } | { allowed: false; reason: NudgeRefusal };

/**
 * Whether this nudge may be sent.
 *
 * Four refusals:
 *
 * - **unassigned** — there is nobody to nudge. Anyone can just do it.
 * - **self** — nudging yourself is not a feature.
 * - **not-due-yet** — chasing someone about tomorrow's chore is nagging by any
 *   reasonable definition.
 * - **already-nudged-today** — once per chore per day, counted across the whole
 *   household rather than per sender. Otherwise three housemates each send
 *   "just one" reminder and someone's phone buzzes three times about one bin,
 *   which is precisely how an app gets its notifications switched off.
 */
export function canNudge(request: NudgeRequest, today: IsoDate): NudgeVerdict {
  if (!request.assigneeId) return { allowed: false, reason: 'unassigned' };
  if (request.assigneeId === request.fromMemberId) return { allowed: false, reason: 'self' };
  if (request.dueOn > today) return { allowed: false, reason: 'not-due-yet' };
  if (request.lastNudgedOn === today) {
    return { allowed: false, reason: 'already-nudged-today' };
  }
  return { allowed: true };
}

/** What the recipient sees. Names the chore, names nobody's failing. */
export function nudgeMessage(choreName: string, fromName: string): { title: string; body: string } {
  return {
    title: choreName,
    // "mentioned" rather than "reminded you" — the latter presumes you forgot.
    body: `${fromName} mentioned this one.`,
  };
}

/** What the sender is told when the app declines. */
export function refusalMessage(reason: NudgeRefusal): string {
  switch (reason) {
    case 'unassigned':
      return 'Nobody is down for this one — anyone can pick it up.';
    case 'self':
      return 'This one is yours already.';
    case 'not-due-yet':
      return "It isn't due yet.";
    case 'already-nudged-today':
      return 'Someone already mentioned this today.';
  }
}
