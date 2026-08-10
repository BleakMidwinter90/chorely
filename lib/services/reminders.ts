/**
 * Reminder delivery: gathering the state the rules need, then acting on their
 * decision.
 *
 * The rules themselves live in `lib/domain/reminders` and know nothing about a
 * database.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import { households, members, occurrences } from '../db/schema';
import { todayInTimezone } from '../domain/date';
import { planReminders, type ReminderCandidate } from '../domain/reminders';
import { sendToMember } from '../push/send';

/** The household's local hour right now, 0–23. */
function hourInTimezone(timeZone: string, now: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  // en-GB renders midnight as "24" in some runtimes; normalise it.
  return Number(formatted) % 24;
}

/**
 * Send any reminders that are due across every household.
 *
 * Safe to call as often as you like. The once-a-day gate in
 * `lib/domain/reminders` is what makes that true, and it is what lets a
 * self-hosted instance run this on a plain interval rather than needing a real
 * scheduler.
 */
export async function dispatchDueReminders(
  now: Date = new Date(),
  db: Database = getDb(),
): Promise<{ sent: number; considered: number }> {
  const allHouseholds = await db.select().from(households);

  let sent = 0;
  let considered = 0;

  for (const household of allHouseholds) {
    const today = todayInTimezone(household.timezone, now);
    const hour = hourInTimezone(household.timezone, now);

    // Open work per member, split into "due today" and "already late".
    const workload = await db
      .select({
        memberId: occurrences.assigneeId,
        dueCount: sql<number>`count(*)`,
        overdueCount: sql<number>`sum(case when ${occurrences.dueOn} < ${today} then 1 else 0 end)`,
      })
      .from(occurrences)
      .where(
        and(
          eq(occurrences.householdId, household.id),
          eq(occurrences.status, 'open'),
          sql`${occurrences.dueOn} <= ${today}`,
        ),
      )
      .groupBy(occurrences.assigneeId);

    const byMember = new Map(
      workload
        .filter((row) => row.memberId)
        .map((row) => [
          row.memberId as string,
          { dueCount: Number(row.dueCount), overdueCount: Number(row.overdueCount ?? 0) },
        ]),
    );

    const roster = await db
      .select()
      .from(members)
      .where(and(eq(members.householdId, household.id), isNull(members.archivedAt)));

    const candidates: ReminderCandidate[] = roster.map((member) => ({
      memberId: member.id,
      remindersEnabled: member.remindersEnabled,
      reminderHour: member.reminderHour,
      lastRemindedOn: member.lastRemindedOn ?? undefined,
      dueCount: byMember.get(member.id)?.dueCount ?? 0,
      overdueCount: byMember.get(member.id)?.overdueCount ?? 0,
    }));

    considered += candidates.length;

    for (const decision of planReminders(candidates, today, hour)) {
      // Stamp before sending, not after. If delivery throws we would otherwise
      // retry on the next tick and could notify someone repeatedly — a missed
      // reminder is a far smaller failure than a notification storm.
      await db
        .update(members)
        .set({ lastRemindedOn: today })
        .where(eq(members.id, decision.memberId));

      const delivered = await sendToMember(
        decision.memberId,
        { title: decision.title, body: decision.body, tag: 'daily-reminder', url: '/home' },
        db,
      );
      if (delivered > 0) sent += 1;
    }
  }

  return { sent, considered };
}
