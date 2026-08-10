/**
 * The fairness ledger: reading completion history out of the database and
 * handing it to the scoring rules in `lib/domain/fairness`.
 */

import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import { chores, members, occurrences, type Chore, type Household, type Member } from '../db/schema';
import { computeBalance, type BalanceReport, type FairnessCompletion } from '../domain/fairness';
import type { IsoDate } from '../domain/types';
import { listMembers } from './households';
import { fairnessWindow } from './scheduling';

export interface HouseholdBalance {
  report: BalanceReport;
  members: Member[];
  /** Convenience lookup so callers do not each rebuild it. */
  nameOf: (memberId: string) => string;
}

/** Balance score and per-member load for the household's current window. */
export async function getHouseholdBalance(
  household: Household,
  today: IsoDate,
  db: Database = getDb(),
): Promise<HouseholdBalance> {
  const window = fairnessWindow(household, today);
  const roster = await listMembers(household.id, db);

  const rows = await db
    .select({
      memberId: occurrences.completedById,
      effort: occurrences.effortAwarded,
      resolvedOn: occurrences.resolvedOn,
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.householdId, household.id),
        eq(occurrences.status, 'done'),
        gte(occurrences.resolvedOn, window.start),
        isNotNull(occurrences.completedById),
      ),
    );

  const completions: FairnessCompletion[] = rows.flatMap((row) =>
    row.memberId && row.resolvedOn
      ? [{ memberId: row.memberId, effort: row.effort ?? 0, completedOn: row.resolvedOn }]
      : [],
  );

  const report = computeBalance(
    roster.map((member) => ({ memberId: member.id, weight: member.weight })),
    completions,
    window,
  );

  const namesById = new Map(roster.map((member) => [member.id, member.name]));

  return {
    report,
    members: roster,
    nameOf: (memberId) => namesById.get(memberId) ?? 'Someone',
  };
}

export interface ActivityEntry {
  id: string;
  chore: Chore;
  member: Member | null;
  effort: number;
  on: IsoDate;
}

/**
 * Recent completions, newest first.
 *
 * The receipts behind the balance score. A number nobody can audit is a number
 * nobody believes, so the score always links back to the actual work.
 */
export async function getRecentActivity(
  household: Household,
  limit = 30,
  db: Database = getDb(),
): Promise<ActivityEntry[]> {
  const rows = await db
    .select({ occurrence: occurrences, chore: chores, member: members })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    .leftJoin(members, eq(members.id, occurrences.completedById))
    .where(and(eq(occurrences.householdId, household.id), eq(occurrences.status, 'done')))
    .orderBy(desc(occurrences.completedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.occurrence.id,
    chore: row.chore,
    member: row.member,
    effort: row.occurrence.effortAwarded ?? 0,
    on: row.occurrence.resolvedOn ?? row.occurrence.dueOn,
  }));
}
