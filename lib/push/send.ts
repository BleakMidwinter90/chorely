/**
 * Delivering push notifications.
 */

import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';

import { getDb, type Database } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { getVapidKeys } from './keys';

export interface PushMessage {
  title: string;
  body: string;
  /** Groups related notifications so a later one replaces an earlier one. */
  tag?: string;
  url?: string;
}

/**
 * Push endpoints that mean "this subscription is dead, stop trying".
 *
 * 404 and 410 are the standard signals for an expired or unsubscribed browser.
 * Anything else — a timeout, a 500 from the push service — is transient and
 * must not cost the user their subscription.
 */
const GONE_STATUS = new Set([404, 410]);

/**
 * Send one message to every device a member has registered.
 *
 * Returns how many were delivered. Dead subscriptions are pruned as they are
 * discovered, which is the only reliable way to learn about them — there is no
 * other notification that a browser has unsubscribed.
 */
export async function sendToMember(
  memberId: string,
  message: PushMessage,
  db: Database = getDb(),
): Promise<number> {
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId));

  if (subscriptions.length === 0) return 0;

  const keys = await getVapidKeys(db);
  const payload = JSON.stringify(message);
  const dead: string[] = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          {
            vapidDetails: {
              subject: keys.subject,
              publicKey: keys.publicKey,
              privateKey: keys.privateKey,
            },
            // A chore reminder is worthless a day late; let it expire.
            TTL: 6 * 60 * 60,
          },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status && GONE_STATUS.has(status)) {
          dead.push(subscription.endpoint);
        }
        throw error;
      }
    }),
  );

  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  }

  return results.filter((result) => result.status === 'fulfilled').length;
}

/** Whether a member has any device that could receive a notification. */
export async function hasSubscription(
  memberId: string,
  db: Database = getDb(),
): Promise<boolean> {
  const rows = await db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId))
    .limit(1);
  return rows.length > 0;
}

export async function saveSubscription(
  input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    memberId: string;
    householdId: string;
  },
  db: Database = getDb(),
): Promise<void> {
  // Re-subscribing on the same device produces the same endpoint, so an upsert
  // keeps it attached to whoever is currently signed in on it.
  await db
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { memberId: input.memberId, householdId: input.householdId, p256dh: input.p256dh, auth: input.auth },
    });
}

export async function removeSubscription(
  endpoint: string,
  memberId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.memberId, memberId)),
    );
}
