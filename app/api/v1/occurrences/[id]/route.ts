import { z } from 'zod';

import { apiError, authenticate, UNAUTHORIZED } from '@/lib/api/auth';
import { completeOccurrence, householdToday, skipOccurrence } from '@/lib/services/scheduling';

const bodySchema = z.object({
  action: z.enum(['complete', 'skip']),
  /**
   * Who did it. Required for a bearer token, since a token identifies a
   * household rather than a person and the ledger must credit somebody real.
   */
  memberId: z.string().trim().min(1).optional(),
});

/**
 * Complete or skip a chore.
 *
 * The write an NFC tag, a smart button or a wall tablet would perform.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await authenticate(request);
  if (!caller) return UNAUTHORIZED();

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError('Body must be {"action":"complete"|"skip","memberId"?:string}', 400);
  }

  const today = householdToday(caller.household);

  if (parsed.data.action === 'skip') {
    await skipOccurrence(caller.household, id, today);
    return Response.json({ ok: true, action: 'skip' });
  }

  // A session knows who is asking; a token does not, so it has to say.
  const memberId = parsed.data.memberId ?? caller.member?.id;
  if (!memberId) {
    return apiError('memberId is required when authenticating with a token.', 400);
  }

  try {
    await completeOccurrence(caller.household, id, memberId, today);
  } catch {
    // completeOccurrence scopes its lookup to the household, so a miss means
    // the id belongs to somebody else — or to nothing.
    return apiError('No such chore in this household.', 404);
  }

  return Response.json({ ok: true, action: 'complete', creditedTo: memberId });
}
