/**
 * Identity without accounts.
 *
 * chorely has no passwords, no email verification and no OAuth. You open an
 * invite link, type your name, and that device is you. The cost of an account
 * system is paid by the least technical person in the house, and it is usually
 * paid by them never signing up.
 *
 * The trade is explicit: possession of the invite link grants access to the
 * household. That is the same security model as a shared calendar link, and it
 * is the right one for "who cleaned the bathroom".
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { households, members, sessions, type Household, type Member } from '../db/schema';

const COOKIE_NAME = 'chorely_session';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Only the hash is ever persisted, so a leaked database file or backup does not
 * hand an attacker a set of live sessions.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison, for anything user-supplied that gates access. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Length is not secret, and timingSafeEqual throws on a mismatch.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface Identity {
  member: Member;
  household: Household;
}

/** Issue a session for `memberId` and set the cookie on the response. */
export async function startSession(memberId: string, householdId: string): Promise<void> {
  const token = createSessionToken();

  await getDb().insert(sessions).values({
    tokenHash: hashToken(token),
    memberId,
    householdId,
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

/**
 * Who is making this request, or `null` if nobody.
 *
 * Returns null rather than throwing for archived members, so someone removed
 * from a household is quietly signed out instead of hitting an error page.
 */
export async function getIdentity(): Promise<Identity | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({ member: members, household: households })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .innerJoin(households, eq(households.id, sessions.householdId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row || row.member.archivedAt) return null;
  return { member: row.member, household: row.household };
}

/**
 * Identity or bust.
 *
 * Every Server Action must call this. Server Actions are reachable by direct
 * POST, so authorisation cannot live in the component that renders the button.
 */
export async function requireIdentity(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) throw new Error('Not signed in to a household');
  return identity;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE_NAME);
}
