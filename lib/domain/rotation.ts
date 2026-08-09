/**
 * Assignment — deciding whose turn it is.
 *
 * Every function here is deterministic: same inputs, same person. That is a
 * correctness requirement, not just a testing convenience. If the app ever
 * shuffles assignments non-deterministically, the household stops trusting it,
 * and an untrusted chore app is just a list nobody reads.
 */

import type { IsoDate, RotationMode } from './types';

export interface RotationCandidate {
  memberId: string;
  /** Agreed share of the household's work. See `FairnessMember.weight`. */
  weight: number;
  /** Effort points already done in the current fairness window. */
  recentPoints: number;
  /** When this member last did *this particular* chore, if ever. */
  lastDidChoreOn?: IsoDate;
}

export interface AssignmentOptions {
  /** Required for `fixed` mode: the member who owns this chore. */
  fixedMemberId?: string;
  /** Required for `rotate` mode: who had it last, so we can pick the next one. */
  lastAssigneeId?: string;
}

/**
 * Pick who takes the next occurrence of a chore.
 *
 * Returns `null` when the chore should be left unclaimed — either the mode says
 * so (`anyone`), or there is nobody eligible to take it.
 *
 * `candidates` must already be filtered to active members and given in a stable
 * order (household join order is the natural one — it makes `rotate` visit
 * people in the order they'd expect).
 */
export function pickAssignee(
  mode: RotationMode,
  candidates: readonly RotationCandidate[],
  options: AssignmentOptions = {},
): string | null {
  if (candidates.length === 0) return null;

  switch (mode) {
    case 'anyone':
      return null;

    case 'fixed': {
      // If the owner has left the household, fall back to fair rather than
      // dropping the chore on the floor.
      const owner = candidates.find((c) => c.memberId === options.fixedMemberId);
      return owner ? owner.memberId : pickFairest(candidates);
    }

    case 'rotate': {
      const lastIndex = candidates.findIndex((c) => c.memberId === options.lastAssigneeId);
      // An unknown or absent previous assignee starts the rotation at the top.
      return candidates[(lastIndex + 1) % candidates.length].memberId;
    }

    case 'fair':
      return pickFairest(candidates);
  }
}

/**
 * Whoever is furthest below their agreed share right now.
 *
 * Ties break toward whoever has gone longest without doing this specific chore,
 * so nobody ends up permanently owning the bathroom. Remaining ties break on
 * member id purely for determinism.
 */
function pickFairest(candidates: readonly RotationCandidate[]): string {
  return [...candidates].sort((a, b) => {
    const loadDiff = a.recentPoints / a.weight - b.recentPoints / b.weight;
    if (Math.abs(loadDiff) > 1e-9) return loadDiff;

    // `undefined` means "never done it", which should win the tie.
    const aLast = a.lastDidChoreOn ?? '';
    const bLast = b.lastDidChoreOn ?? '';
    if (aLast !== bLast) return aLast < bLast ? -1 : 1;

    return a.memberId.localeCompare(b.memberId);
  })[0].memberId;
}
