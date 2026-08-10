/**
 * The two things housemates do to each other about chores: hand one over, and
 * mention one.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import { chores, members, nudges, occurrences, type Household } from '../db/schema';
import { canNudge, nudgeMessage, refusalMessage } from '../domain/nudges';
import { pickAssignee } from '../domain/rotation';
import type { IsoDate } from '../domain/types';
import { createId } from '../ids';
import { sendToMember } from '../push/send';
import { fairnessWindow } from './scheduling';

export interface SocialResult {
  ok: boolean;
  message?: string;
}

/**
 * Hand a chore to whoever is currently carrying the least.
 *
 * Deliberately not a negotiation. A "would you swap?" flow needs a request, a
 * reply, a pending state and a way to decline, and every one of those is a place
 * for an awkward silence to live. Handing it straight to the fairest other
 * person is one tap, and the balance score is what stops it being abused —
 * everything you hand over is work you have not done.
 */
export async function handOverOccurrence(
  household: Household,
  occurrenceId: string,
  today: IsoDate,
  db: Database = getDb(),
): Promise<SocialResult> {
  const rows = await db
    .select({ occurrence: occurrences, chore: chores })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    .where(and(eq(occurrences.id, occurrenceId), eq(occurrences.householdId, household.id)))
    .limit(1);

  const row = rows[0];
  if (!row || row.occurrence.status !== 'open') return { ok: false, message: 'Chore not found' };

  const roster = await db
    .select()
    .from(members)
    .where(and(eq(members.householdId, household.id), isNull(members.archivedAt)))
    .orderBy(members.sortOrder, members.id);

  const others = roster.filter((member) => member.id !== row.occurrence.assigneeId);
  if (others.length === 0) {
    return { ok: false, message: 'There is nobody else to hand it to.' };
  }

  const { start } = fairnessWindow(household, today);
  const done = await db
    .select({
      memberId: occurrences.completedById,
      effort: occurrences.effortAwarded,
      on: occurrences.resolvedOn,
    })
    .from(occurrences)
    .where(and(eq(occurrences.householdId, household.id), eq(occurrences.status, 'done')));

  const points = new Map<string, number>();
  for (const entry of done) {
    if (!entry.memberId || !entry.on || entry.on < start) continue;
    points.set(entry.memberId, (points.get(entry.memberId) ?? 0) + (entry.effort ?? 0));
  }

  const nextAssignee = pickAssignee(
    'fair',
    others.map((member) => ({
      memberId: member.id,
      weight: member.weight,
      recentPoints: points.get(member.id) ?? 0,
    })),
  );

  await db
    .update(occurrences)
    .set({ assigneeId: nextAssignee })
    .where(eq(occurrences.id, occurrenceId));

  const name = others.find((member) => member.id === nextAssignee)?.name;
  return { ok: true, message: name ? `Passed to ${name}.` : 'Passed on.' };
}

/**
 * Mention a chore to whoever it belongs to.
 *
 * All the restraint lives in `lib/domain/nudges`; this only gathers the state
 * that decision needs and, if it passes, records and delivers it.
 */
export async function nudgeAboutOccurrence(
  household: Household,
  occurrenceId: string,
  fromMemberId: string,
  today: IsoDate,
  db: Database = getDb(),
): Promise<SocialResult> {
  const rows = await db
    .select({ occurrence: occurrences, chore: chores })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    .where(and(eq(occurrences.id, occurrenceId), eq(occurrences.householdId, household.id)))
    .limit(1);

  const row = rows[0];
  if (!row || row.occurrence.status !== 'open') return { ok: false, message: 'Chore not found' };

  const [lastNudge] = await db
    .select({ sentOn: nudges.sentOn })
    .from(nudges)
    .where(eq(nudges.occurrenceId, occurrenceId))
    .orderBy(desc(nudges.sentOn))
    .limit(1);

  const verdict = canNudge(
    {
      fromMemberId,
      assigneeId: row.occurrence.assigneeId,
      dueOn: row.occurrence.dueOn,
      lastNudgedOn: lastNudge?.sentOn,
    },
    today,
  );

  if (!verdict.allowed) return { ok: false, message: refusalMessage(verdict.reason) };

  const [sender] = await db
    .select({ name: members.name })
    .from(members)
    .where(eq(members.id, fromMemberId))
    .limit(1);

  // Recorded before sending. If delivery fails the cap still holds, which is
  // the safe direction to fail in — a missed nudge beats a repeated one.
  await db.insert(nudges).values({
    id: createId('nudge'),
    householdId: household.id,
    occurrenceId,
    fromMemberId,
    toMemberId: row.occurrence.assigneeId,
    sentOn: today,
  });

  const message = nudgeMessage(row.chore.name, sender?.name ?? 'Someone');
  await sendToMember(
    row.occurrence.assigneeId!,
    { ...message, tag: `nudge-${occurrenceId}`, url: '/home' },
    db,
  );

  return { ok: true, message: 'Mentioned.' };
}
