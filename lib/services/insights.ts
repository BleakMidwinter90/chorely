/**
 * History and insight: what the household's record actually looks like over
 * time, rather than just this month's number.
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { getDb, type Database } from '../db/client';
import { chores, occurrences, type Household } from '../db/schema';
import { addDays } from '../domain/date';
import { computeStreak, type Streak } from '../domain/streaks';
import type { IsoDate } from '../domain/types';

/**
 * One person's streak.
 *
 * Needs both the days they completed something and the days anything was
 * actually asked of them — the second is what stops an empty schedule reading
 * as either a failure or an achievement.
 */
export async function getMemberStreak(
  household: Household,
  memberId: string,
  today: IsoDate,
  db: Database = getDb(),
): Promise<Streak> {
  // 120 days is far more than any streak worth displaying, and keeps this to a
  // small scan on a table that only ever holds a household's own rows.
  const since = addDays(today, -120);

  const completedRows = await db
    .selectDistinct({ day: occurrences.resolvedOn })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.householdId, household.id),
        eq(occurrences.status, 'done'),
        eq(occurrences.completedById, memberId),
        gte(occurrences.resolvedOn, since),
      ),
    );

  const dueRows = await db
    .selectDistinct({ day: occurrences.dueOn })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.householdId, household.id),
        eq(occurrences.assigneeId, memberId),
        gte(occurrences.dueOn, since),
        // A chore due tomorrow cannot break a streak today.
        sql`${occurrences.dueOn} <= ${today}`,
      ),
    );

  return computeStreak(
    {
      completedOn: completedRows.flatMap((row) => (row.day ? [row.day] : [])),
      dueOn: dueRows.map((row) => row.day),
    },
    today,
  );
}

export interface WeekActivity {
  /** Monday of the week, `YYYY-MM-DD`. */
  weekStart: IsoDate;
  /** Effort points completed across the whole household that week. */
  points: number;
  chores: number;
}

/**
 * Household effort week by week, oldest first.
 *
 * Weeks with nothing in them are included as zeroes. A chart that silently
 * omits empty weeks compresses time and makes a quiet fortnight look like
 * steady activity.
 */
export async function getWeeklyActivity(
  household: Household,
  today: IsoDate,
  weeks = 8,
  db: Database = getDb(),
): Promise<WeekActivity[]> {
  // Rewind to the Monday on or before today, then back to the first week shown.
  const todayDate = new Date(`${today}T00:00:00Z`);
  const daysSinceMonday = (todayDate.getUTCDay() + 6) % 7;
  const thisMonday = addDays(today, -daysSinceMonday);
  const firstMonday = addDays(thisMonday, -(weeks - 1) * 7);

  const rows = await db
    .select({
      day: occurrences.resolvedOn,
      points: sql<number>`coalesce(sum(${occurrences.effortAwarded}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(occurrences)
    .where(
      and(
        eq(occurrences.householdId, household.id),
        eq(occurrences.status, 'done'),
        gte(occurrences.resolvedOn, firstMonday),
      ),
    )
    .groupBy(occurrences.resolvedOn);

  const buckets: WeekActivity[] = Array.from({ length: weeks }, (_, index) => ({
    weekStart: addDays(firstMonday, index * 7),
    points: 0,
    chores: 0,
  }));

  for (const row of rows) {
    if (!row.day) continue;
    const index = Math.floor(
      (new Date(`${row.day}T00:00:00Z`).getTime() - new Date(`${firstMonday}T00:00:00Z`).getTime()) /
        (7 * 86_400_000),
    );
    if (index < 0 || index >= buckets.length) continue;
    buckets[index].points += Number(row.points);
    buckets[index].chores += Number(row.count);
  }

  return buckets;
}

export interface ChoreInsight {
  choreId: string;
  name: string;
  icon: string;
  done: number;
  skipped: number;
  /** 0–100. */
  skipRate: number;
}

/**
 * Chores the household keeps skipping.
 *
 * Framed as information about the *chore*, never about a person. A job that
 * gets skipped two times in three is usually a job the house does not actually
 * need, and noticing that is more useful than nagging anyone to do it.
 */
export async function getMostSkippedChores(
  household: Household,
  limit = 3,
  db: Database = getDb(),
): Promise<ChoreInsight[]> {
  const rows = await db
    .select({
      choreId: chores.id,
      name: chores.name,
      icon: chores.icon,
      done: sql<number>`sum(case when ${occurrences.status} = 'done' then 1 else 0 end)`,
      skipped: sql<number>`sum(case when ${occurrences.status} = 'skipped' then 1 else 0 end)`,
    })
    .from(occurrences)
    .innerJoin(chores, eq(chores.id, occurrences.choreId))
    .where(eq(occurrences.householdId, household.id))
    .groupBy(chores.id);

  return rows
    .map((row) => {
      const done = Number(row.done ?? 0);
      const skipped = Number(row.skipped ?? 0);
      const total = done + skipped;
      return {
        choreId: row.choreId,
        name: row.name,
        icon: row.icon,
        done,
        skipped,
        skipRate: total === 0 ? 0 : Math.round((100 * skipped) / total),
      };
    })
    // Needs enough history to mean anything: one skip out of one is noise.
    .filter((insight) => insight.skipped >= 2 && insight.skipRate >= 40)
    .sort((a, b) => b.skipRate - a.skipRate || b.skipped - a.skipped)
    .slice(0, limit);
}
