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
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { ensureMigrated } from '../db/migrate';
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

/**
 * Whether to mark the session cookie `Secure`.
 *
 * This cannot key off `NODE_ENV`. The primary way chorely gets deployed is a
 * container on a home network, reached over plain HTTP at something like
 * `http://192.168.1.20:3000` — and a browser silently discards a `Secure`
 * cookie on an insecure origin. Marking it `Secure` in production therefore
 * breaks sign-in completely for exactly the people this project is built for,
 * and does it invisibly: the page loads, the cookie vanishes, and every action
 * afterwards claims you are not signed in.
 *
 * So the flag follows the actual protocol of the request. Set `COOKIE_SECURE=1`
 * to force it on behind a proxy that does not send `x-forwarded-proto`.
 */
export function isSecureRequest(forwardedProto: string | null, override?: string): boolean {
  if (override === '1') return true;
  if (override === '0') return false;
  // A proxy chain sends a comma-separated list; the first entry is the client.
  return forwardedProto?.split(',')[0].trim().toLowerCase() === 'https';
}

async function shouldUseSecureCookie(): Promise<boolean> {
  const headerList = await headers();
  return isSecureRequest(headerList.get('x-forwarded-proto'), process.env.COOKIE_SECURE);
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
    secure: await shouldUseSecureCookie(),
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
}

/**
 * Who is making this request, or `null` if nobody.
 *
 * Returns null rather than throwing for archived members, so someone removed
 * from a household is quietly signed out instead of hitting an error page.
 *
 * Wrapped in React's `cache`, which deduplicates it per request. The layout
 * needs the identity to render the header, and every page beneath it needs the
 * same identity — without this, each page load ran the session join twice.
 */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  // Every page and action funnels through here, which makes it the natural
  // place to guarantee the schema exists. Self-hosters should never have to run
  // a migration command after pulling a new image.
  await ensureMigrated();

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
});

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
