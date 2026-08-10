/**
 * Household lifecycle: creating one, joining one, and reading the state the
 * Today view renders.
 */

import { and, asc, eq, isNull } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import {
  chores,
  households,
  members,
  occurrences,
  type Chore,
  type Household,
  type Member,
  type Occurrence,
} from '../db/schema';
import { dueStatus, type DueStatus } from '../domain/recurrence';
import type { IsoDate, Recurrence, RotationMode } from '../domain/types';
import { createId, createJoinCode } from '../ids';
import { ensureOpenOccurrences, householdToday } from './scheduling';

/**
 * Chores a household gets on day one.
 *
 * An empty app asks the user to do the hardest part — think of everything —
 * before it has earned any trust. These are the chores nearly every home has,
 * pre-priced by effort, and all of them are deletable in one tap.
 */
const STARTER_CHORES: Array<{
  name: string;
  icon: string;
  effort: number;
  recurrence: Recurrence;
}> = [
  { name: 'Take out the bins', icon: '🗑️', effort: 1, recurrence: { kind: 'weekly', weekdays: [1] } },
  { name: 'Wash the dishes', icon: '🍽️', effort: 2, recurrence: { kind: 'everyNDays', days: 1, from: 'start' } },
  { name: 'Clean the bathroom', icon: '🚿', effort: 4, recurrence: { kind: 'everyNDays', days: 7, from: 'completion' } },
  { name: 'Vacuum', icon: '🧹', effort: 3, recurrence: { kind: 'everyNDays', days: 7, from: 'completion' } },
  { name: 'Do the laundry', icon: '🧺', effort: 2, recurrence: { kind: 'everyNDays', days: 4, from: 'completion' } },
  { name: 'Wipe the kitchen counters', icon: '🧽', effort: 1, recurrence: { kind: 'everyNDays', days: 2, from: 'completion' } },
  { name: 'Change the bedsheets', icon: '🛏️', effort: 2, recurrence: { kind: 'everyNDays', days: 14, from: 'completion' } },
  { name: 'Food shop', icon: '🛒', effort: 3, recurrence: { kind: 'weekly', weekdays: [6] } },
];

export interface CreateHouseholdInput {
  householdName: string;
  memberName: string;
  emoji?: string;
  timezone?: string;
  withStarterChores?: boolean;
  /** Overrides "today". Injectable so tests are not tied to the wall clock. */
  today?: IsoDate;
}

export async function createHousehold(
  input: CreateHouseholdInput,
  db: Database = getDb(),
): Promise<{ household: Household; member: Member }> {
  const householdId = createId('household');
  const memberId = createId('member');

  const [household] = await db
    .insert(households)
    .values({
      id: householdId,
      name: input.householdName.trim(),
      joinCode: createJoinCode(),
      timezone: input.timezone || 'UTC',
    })
    .returning();

  const [member] = await db
    .insert(members)
    .values({
      id: memberId,
      householdId,
      name: input.memberName.trim(),
      emoji: input.emoji || '🙂',
      sortOrder: 0,
    })
    .returning();

  if (input.withStarterChores !== false) {
    const today = input.today ?? householdToday(household);
    await db.insert(chores).values(
      STARTER_CHORES.map((starter) => ({
        id: createId('chore'),
        householdId,
        name: starter.name,
        icon: starter.icon,
        effort: starter.effort,
        recurrence: starter.recurrence,
        rotationMode: 'fair' as const,
        startOn: today,
      })),
    );
    await ensureOpenOccurrences(household, today, db);
  }

  return { household, member };
}

export async function findHouseholdByJoinCode(
  joinCode: string,
  db: Database = getDb(),
): Promise<Household | null> {
  const rows = await db
    .select()
    .from(households)
    .where(eq(households.joinCode, joinCode))
    .limit(1);
  return rows[0] ?? null;
}

/** Add a person to a household they were invited to. */
export async function joinHousehold(
  household: Household,
  name: string,
  emoji: string,
  db: Database = getDb(),
): Promise<Member> {
  const existing = await db
    .select({ sortOrder: members.sortOrder })
    .from(members)
    .where(eq(members.householdId, household.id));
  const nextSortOrder = existing.reduce((max, m) => Math.max(max, m.sortOrder), -1) + 1;

  const [member] = await db
    .insert(members)
    .values({
      id: createId('member'),
      householdId: household.id,
      name: name.trim(),
      emoji: emoji || '🙂',
      sortOrder: nextSortOrder,
    })
    .returning();

  // A new pair of hands changes who the fairest assignee is, so re-open the
  // schedule rather than leaving everything on whoever joined first.
  await reassignOpenOccurrences(household, db);

  return member;
}

/**
 * Discard open (not yet done) occurrences and rebuild them.
 *
 * Used when the membership changes. Only untouched work is affected, so no
 * history is lost.
 */
export async function reassignOpenOccurrences(
  household: Household,
  db: Database = getDb(),
): Promise<void> {
  await db
    .delete(occurrences)
    .where(and(eq(occurrences.householdId, household.id), eq(occurrences.status, 'open')));
  await ensureOpenOccurrences(household, householdToday(household), db);
}

export async function listMembers(
  householdId: string,
  db: Database = getDb(),
): Promise<Member[]> {
  return db
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), isNull(members.archivedAt)))
    .orderBy(asc(members.sortOrder), asc(members.id));
}

export async function listChores(householdId: string, db: Database = getDb()): Promise<Chore[]> {
  return db
    .select()
    .from(chores)
    .where(and(eq(chores.householdId, householdId), isNull(chores.archivedAt)))
    .orderBy(asc(chores.createdAt));
}

export interface CreateChoreInput {
  name: string;
  icon: string;
  effort: number;
  recurrence: Recurrence;
  rotationMode: RotationMode;
  fixedMemberId?: string;
}

export async function createChore(
  household: Household,
  input: CreateChoreInput,
  today: IsoDate,
  db: Database = getDb(),
): Promise<Chore> {
  const [chore] = await db
    .insert(chores)
    .values({
      id: createId('chore'),
      householdId: household.id,
      name: input.name.trim(),
      icon: input.icon,
      effort: input.effort,
      recurrence: input.recurrence,
      rotationMode: input.rotationMode,
      fixedMemberId: input.rotationMode === 'fixed' ? input.fixedMemberId : null,
      startOn: today,
    })
    .returning();

  await ensureOpenOccurrences(household, today, db);
  return chore;
}

/**
 * Retire a chore.
 *
 * Archived, not deleted: its completions are part of the fairness ledger, and
 * deleting the chore would quietly rewrite who had been pulling their weight.
 */
export async function archiveChore(
  household: Household,
  choreId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .update(chores)
    .set({ archivedAt: new Date() })
    .where(and(eq(chores.id, choreId), eq(chores.householdId, household.id)));

  await db
    .delete(occurrences)
    .where(and(eq(occurrences.choreId, choreId), eq(occurrences.status, 'open')));
}

export interface AgendaItem {
  occurrence: Occurrence;
  chore: Chore;
  assignee: Member | null;
  status: DueStatus;
}

/**
 * The Today view: every open occurrence, soonest first.
 *
 * Calls `ensureOpenOccurrences` first, so simply opening the app catches the
 * schedule up. Self-hosted instances cannot count on a cron job existing.
 */
export async function getAgenda(
  household: Household,
  today: IsoDate,
  db: Database = getDb(),
): Promise<AgendaItem[]> {
  await ensureOpenOccurrences(household, today, db);

  const rows = await db
    .select({ occurrence: occurrences, chore: chores, assignee: members })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    .leftJoin(members, eq(members.id, occurrences.assigneeId))
    .where(and(eq(occurrences.householdId, household.id), eq(occurrences.status, 'open')))
    .orderBy(asc(occurrences.dueOn), asc(chores.createdAt));

  return rows.map((row) => ({
    occurrence: row.occurrence,
    chore: row.chore,
    assignee: row.assignee,
    status: dueStatus(row.occurrence.dueOn, today),
  }));
}
