import { z } from 'zod';

import { getIdentity } from '@/lib/auth/session';
import { getPublicVapidKey } from '@/lib/push/keys';
import { removeSubscription, saveSubscription } from '@/lib/push/send';

/**
 * The public VAPID key a browser needs in order to subscribe.
 *
 * Public by definition — it is handed to every client that subscribes — but
 * still gated on a session, since there is no reason for a stranger to be able
 * to fingerprint the instance.
 */
export async function GET() {
  const identity = await getIdentity();
  if (!identity) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  return Response.json({ publicKey: await getPublicVapidKey() });
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Malformed subscription' }, { status: 400 });
  }

  await saveSubscription({
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    memberId: identity.member.id,
    householdId: identity.household.id,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const identity = await getIdentity();
  if (!identity) {
    return Response.json({ error: 'Not signed in' }, { status: 401 });
  }

  const parsed = z
    .object({ endpoint: z.string().url().max(2000) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Malformed request' }, { status: 400 });
  }

  // Scoped to the caller: nobody can unsubscribe somebody else's device.
  await removeSubscription(parsed.data.endpoint, identity.member.id);
  return Response.json({ ok: true });
}
