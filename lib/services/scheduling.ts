/**
 * Scheduling service: the bridge between the pure rules in `lib/domain` and the
 * database.
 *
 * Nothing here re-implements scheduling or fairness logic. It loads state,
 * hands it to the domain functions, and writes the answer back — so the rules
 * stay testable without a database and the queries stay free of business logic.
 */

import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import { chores, members, occurrences, type Chore, type Household } from '../db/schema';
import { isAwayOn, type AwayPeriod } from '../domain/away';
import { addDays, todayInTimezone } from '../domain/date';
import { nextDueDate } from '../domain/recurrence';
import { pickAssignee, type RotationCandidate } from '../domain/rotation';
import type { IsoDate } from '../domain/types';
import { createId } from '../ids';

/** Null unless both ends are set — a half-filled period means nothing. */
export function toAwayPeriod(member: {
  awayFrom: string | null;
  awayUntil: string | null;
}): AwayPeriod | null {
  return member.awayFrom && member.awayUntil
    ? { from: member.awayFrom, until: member.awayUntil }
    : null;
}

/** "Today" as the household experiences it, not as the server does. */
export function householdToday(household: Household, now = new Date()): IsoDate {
  return todayInTimezone(household.timezone, now);
}

export function fairnessWindow(household: Household, today: IsoDate) {
  return { start: addDays(today, -(household.fairnessWindowDays - 1)), end: today };
}

/**
 * Everything `pickAssignee` needs about each active member: their agreed
 * weight, what they have done lately, and when they last did this chore.
 */
async function loadCandidates(
  db: Database,
  householdId: string,
  windowStart: IsoDate,
  windowEnd: IsoDate,
): Promise<Map<string, Omit<RotationCandidate, 'lastDidChoreOn'>>> {
  const roster = await db
    .select({
      id: members.id,
      weight: members.weight,
      awayFrom: members.awayFrom,
      awayUntil: members.awayUntil,
    })
    .from(members)
    .where(and(eq(members.householdId, householdId), isNull(members.archivedAt)))
    .orderBy(members.sortOrder, members.id);

  // Somebody on holiday should not come home to a fortnight of chores with
  // their name on. If everyone is away, fall back to the whole roster rather
  // than leaving the household with nothing assigned to anybody.
  const present = roster.filter(
    (member) => !isAwayOn(toAwayPeriod(member), windowEnd),
  );
  const active = present.length > 0 ? present : roster;

  const recent = await db
    .select({
      memberId: occurrences.completedById,
      points: sql<number>`coalesce(sum(${occurrences.effortAwarded}), 0)`,
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.householdId, householdId),
        eq(occurrences.status, 'done'),
        gte(occurrences.resolvedOn, windowStart),
      ),
    )
    .groupBy(occurrences.completedById);

  const pointsByMember = new Map(recent.map((r) => [r.memberId, Number(r.points)]));

  // A Map preserves insertion order, which is join order — exactly the order
  // `rotate` should visit people in.
  return new Map(
    active.map((member) => [
      member.id,
      {
        memberId: member.id,
        weight: member.weight,
        recentPoints: pointsByMember.get(member.id) ?? 0,
      },
    ]),
  );
}

/** Most recent completion date per member, for one specific chore. */
async function loadChoreHistory(
  db: Database,
  choreIds: string[],
): Promise<Map<string, Map<string, IsoDate>>> {
  if (choreIds.length === 0) return new Map();

  const rows = await db
    .select({
      choreId: occurrences.choreId,
      memberId: occurrences.completedById,
      lastOn: sql<string>`max(${occurrences.resolvedOn})`,
    })
    .from(occurrences)
    .where(and(inArray(occurrences.choreId, choreIds), eq(occurrences.status, 'done')))
    .groupBy(occurrences.choreId, occurrences.completedById);

  const byChore = new Map<string, Map<string, IsoDate>>();
  for (const row of rows) {
    if (!row.memberId || !row.lastOn) continue;
    const entry = byChore.get(row.choreId) ?? new Map<string, IsoDate>();
    entry.set(row.memberId, row.lastOn);
    byChore.set(row.choreId, entry);
  }
  return byChore;
}

interface ChoreState {
  /**
   * Last date this chore stopped being open, done *or* skipped.
   *
   * Skips advance the schedule deliberately: a chore the household genuinely
   * did not need this week should come back next cycle, not sit in the overdue
   * pile accusing everyone. Only completions reach the fairness ledger.
   */
  lastResolvedOn?: IsoDate;
  lastAssigneeId?: string;
}

/** Last resolution and last assignee per chore, in one pass. */
async function loadChoreState(db: Database, choreIds: string[]): Promise<Map<string, ChoreState>> {
  if (choreIds.length === 0) return new Map();

  const rows = await db
    .select({
      choreId: occurrences.choreId,
      resolvedOn: occurrences.resolvedOn,
      assigneeId: occurrences.assigneeId,
    })
    .from(occurrences)
    .where(inArray(occurrences.choreId, choreIds))
    // `id` breaks ties, since several occurrences can be created in one
    // millisecond and "who had it last" must be deterministic.
    .orderBy(occurrences.createdAt, occurrences.id);

  const state = new Map<string, ChoreState>();
  for (const row of rows) {
    const current = state.get(row.choreId) ?? {};
    if (row.resolvedOn && (!current.lastResolvedOn || row.resolvedOn > current.lastResolvedOn)) {
      current.lastResolvedOn = row.resolvedOn;
    }
    // Rows arrive oldest-first, so the last assignee seen is the latest one.
    if (row.assigneeId) current.lastAssigneeId = row.assigneeId;
    state.set(row.choreId, current);
  }
  return state;
}

/**
 * Make sure every active chore has exactly one open occurrence.
 *
 * Idempotent, and cheap enough to run on every page load — which is how it is
 * used. A self-hosted app cannot rely on a cron job existing, so the schedule
 * catches up whenever somebody actually looks at it.
 */
export async function ensureOpenOccurrences(
  household: Household,
  today: IsoDate,
  db: Database = getDb(),
): Promise<number> {
  const active = await db
    .select()
    .from(chores)
    .where(and(eq(chores.householdId, household.id), isNull(chores.archivedAt)));
  if (active.length === 0) return 0;

  const open = await db
    .select({ choreId: occurrences.choreId })
    .from(occurrences)
    .where(and(eq(occurrences.householdId, household.id), eq(occurrences.status, 'open')));
  const alreadyOpen = new Set(open.map((row) => row.choreId));

  const pending = active.filter((chore) => !alreadyOpen.has(chore.id));
  if (pending.length === 0) return 0;

  const { start } = fairnessWindow(household, today);
  const [candidates, state, history] = await Promise.all([
    loadCandidates(db, household.id, start, today),
    loadChoreState(db, pending.map((c) => c.id)),
    loadChoreHistory(db, pending.map((c) => c.id)),
  ]);

  /**
   * Work handed out earlier in this same pass.
   *
   * Without this, scheduling five chores at once sees five identical "nobody
   * has done anything yet" snapshots and drops all five on the same person.
   * Fairness has to account for work that is *pending*, not just work that is
   * finished — otherwise a brand new household assigns every chore to whoever
   * sorts first, which is exactly the impression the app exists to avoid.
   */
  const projected = new Map([...candidates].map(([id, c]) => [id, c.recentPoints]));

  const rows = pending.flatMap((chore) => {
    const choreState = state.get(chore.id) ?? {};
    const dueOn = nextDueDate(chore.recurrence, {
      startOn: chore.startOn,
      lastCompletedOn: choreState.lastResolvedOn,
    });
    // A finished one-off has no next occurrence.
    if (!dueOn) return [];

    const choreHistory = history.get(chore.id);
    const assigneeId = pickAssignee(
      chore.rotationMode,
      [...candidates.values()].map((candidate) => ({
        ...candidate,
        recentPoints: projected.get(candidate.memberId) ?? candidate.recentPoints,
        lastDidChoreOn: choreHistory?.get(candidate.memberId),
      })),
      { fixedMemberId: chore.fixedMemberId ?? undefined, lastAssigneeId: choreState.lastAssigneeId },
    );

    if (assigneeId) {
      projected.set(assigneeId, (projected.get(assigneeId) ?? 0) + chore.effort);
    }

    return [
      {
        id: createId('occurrence'),
        householdId: household.id,
        choreId: chore.id,
        dueOn,
        assigneeId,
        status: 'open' as const,
      },
    ];
  });

  if (rows.length === 0) return 0;
  await db.insert(occurrences).values(rows);
  return rows.length;
}

/**
 * Mark an occurrence done and schedule the next one.
 *
 * `completedById` is recorded separately from `assigneeId` on purpose: doing a
 * chore that was someone else's turn is a kindness, and the ledger should
 * credit the person who actually did the work.
 */
export async function completeOccurrence(
  household: Household,
  occurrenceId: string,
  completedById: string,
  today: IsoDate,
  db: Database = getDb(),
): Promise<void> {
  const rows = await db
    .select({ occurrence: occurrences, chore: chores })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    // Scoping the read to the household is the authorisation check: an id from
    // another household simply does not exist here.
    .where(and(eq(occurrences.id, occurrenceId), eq(occurrences.householdId, household.id)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error('Chore not found');
  if (row.occurrence.status !== 'open') return; // Idempotent: double-tap is harmless.

  await db
    .update(occurrences)
    .set({
      status: 'done',
      completedById,
      completedAt: new Date(),
      resolvedOn: today,
      // Snapshot the effort so re-pricing a chore later cannot rewrite history.
      effortAwarded: row.chore.effort,
    })
    .where(eq(occurrences.id, occurrenceId));

  await ensureOpenOccurrences(household, today, db);
}

/**
 * Skip an occurrence without crediting anyone.
 *
 * Necessary for honesty: if the household ate out all week, the kitchen chore
 * should be dismissable without either pretending it was done or leaving it to
 * rot in the overdue pile.
 */
export async function skipOccurrence(
  household: Household,
  occurrenceId: string,
  today: IsoDate,
  db: Database = getDb(),
): Promise<void> {
  const result = await db
    .update(occurrences)
    .set({ status: 'skipped', resolvedOn: today })
    .where(
      and(
        eq(occurrences.id, occurrenceId),
        eq(occurrences.householdId, household.id),
        eq(occurrences.status, 'open'),
      ),
    );
  if (result.rowsAffected === 0) return;

  await ensureOpenOccurrences(household, today, db);
}

export type { Chore };
