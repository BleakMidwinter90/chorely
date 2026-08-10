/**
 * Authenticating an API request.
 *
 * Two ways in, both resolving to a household:
 *
 * - A bearer token, for scripts, automations and native clients.
 * - The ordinary session cookie, so the browser can call the same endpoints
 *   without a second credential.
 */

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { getIdentity } from '../auth/session';
import { getDb, type Database } from '../db/client';
import { ensureMigrated } from '../db/migrate';
import { apiTokens, households, type Household, type Member } from '../db/schema';

const TOKEN_PREFIX = 'chorely_';

export interface ApiCaller {
  household: Household;
  /** Present for a browser session; absent for a bearer token. */
  member: Member | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A new token, returned in plaintext exactly once. */
export function mintToken(): { token: string; hash: string; prefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, 16) };
}

/**
 * Who is calling, or null.
 *
 * Never throws: routes decide what to do about an anonymous caller, and a
 * malformed header is simply not a valid credential.
 */
export async function authenticate(request: Request): Promise<ApiCaller | null> {
  await ensureMigrated();

  const header = request.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim();
    if (!token) return null;

    const db: Database = getDb();
    const rows = await db
      .select({ household: households })
      .from(apiTokens)
      .innerJoin(households, eq(households.id, apiTokens.householdId))
      .where(eq(apiTokens.tokenHash, hashToken(token)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Recorded so an unused token can be spotted and revoked with confidence.
    // Deliberately not awaited into the response path, and explicitly caught:
    // an unhandled rejection here would take the whole server down over a
    // bookkeeping write nobody is waiting for.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.tokenHash, hashToken(token)))
      .catch(() => {});

    return { household: row.household, member: null };
  }

  const identity = await getIdentity();
  return identity ? { household: identity.household, member: identity.member } : null;
}

/** Consistent shape for every error this API returns. */
export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export const UNAUTHORIZED = () =>
  apiError('Provide a bearer token or sign in to a household.', 401);
