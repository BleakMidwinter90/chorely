import { and, eq } from 'drizzle-orm';

import { authenticate, UNAUTHORIZED } from '@/lib/api/auth';
import { getDb } from '@/lib/db/client';
import { chores, members, occurrences, shoppingItems } from '@/lib/db/schema';

/**
 * Everything this household has, as one JSON document.
 *
 * Data portability was called out repeatedly by self-hosters in the research,
 * and it is the honest counterpart to "your data lives in one file you
 * control": that claim is worth nothing if the only way to read it is SQLite.
 *
 * Secrets are deliberately excluded — the join code, session tokens, API token
 * hashes and push subscriptions are credentials, not content, and an export is
 * a file people email to themselves.
 */
export async function GET(request: Request) {
  const caller = await authenticate(request);
  if (!caller) return UNAUTHORIZED();

  const db = getDb();
  const householdId = caller.household.id;

  const [roster, choreRows, occurrenceRows, shoppingRows] = await Promise.all([
    db.select().from(members).where(eq(members.householdId, householdId)),
    db.select().from(chores).where(eq(chores.householdId, householdId)),
    db.select().from(occurrences).where(eq(occurrences.householdId, householdId)),
    db
      .select()
      .from(shoppingItems)
      .where(and(eq(shoppingItems.householdId, householdId))),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'chorely.v1',
    household: {
      id: caller.household.id,
      name: caller.household.name,
      timezone: caller.household.timezone,
      fairnessWindowDays: caller.household.fairnessWindowDays,
      createdAt: caller.household.createdAt,
    },
    members: roster.map((member) => ({
      id: member.id,
      name: member.name,
      emoji: member.emoji,
      weight: member.weight,
      awayFrom: member.awayFrom,
      awayUntil: member.awayUntil,
      archivedAt: member.archivedAt,
      createdAt: member.createdAt,
    })),
    chores: choreRows,
    occurrences: occurrenceRows,
    shoppingItems: shoppingRows,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      // Downloads as a file rather than filling a browser tab with JSON.
      'Content-Disposition': `attachment; filename="chorely-${householdId}-${
        new Date().toISOString().slice(0, 10)
      }.json"`,
    },
  });
}
