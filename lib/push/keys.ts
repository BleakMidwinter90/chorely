/**
 * VAPID keys.
 *
 * Web push requires an application server keypair. Asking a self-hoster to run
 * `web-push generate-vapid-keys` and paste two base64 strings into a compose
 * file before notifications work is exactly the kind of step that makes people
 * give up, so the app mints its own on first use and stores them alongside the
 * data they belong to.
 *
 * Environment variables still win when set, for anyone who would rather manage
 * keys themselves or run several instances against one key.
 */

import { eq } from 'drizzle-orm';
import webpush from 'web-push';

import { getDb, type Database } from '../db/client';
import { appSettings } from '../db/schema';

const PUBLIC_KEY = 'vapid_public_key';
const PRIVATE_KEY = 'vapid_private_key';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cached: VapidKeys | null = null;

async function readSetting(db: Database, key: string): Promise<string | null> {
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

/**
 * The instance's keypair, generating and persisting one if none exists.
 *
 * Cached per process: the keys never change, and every push call would
 * otherwise hit the database twice.
 */
export async function getVapidKeys(db: Database = getDb()): Promise<VapidKeys> {
  if (cached) return cached;

  // `mailto:` is required by the spec; push services use it to contact whoever
  // runs the server if something is wrong.
  const subject = process.env.VAPID_SUBJECT || 'mailto:chorely@localhost';

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject,
    };
    return cached;
  }

  const [existingPublic, existingPrivate] = await Promise.all([
    readSetting(db, PUBLIC_KEY),
    readSetting(db, PRIVATE_KEY),
  ]);

  if (existingPublic && existingPrivate) {
    cached = { publicKey: existingPublic, privateKey: existingPrivate, subject };
    return cached;
  }

  const generated = webpush.generateVAPIDKeys();

  // `onConflictDoNothing` rather than a plain insert: two requests arriving
  // together on a cold instance would otherwise race, and the loser would
  // persist keys that disagree with the ones it just handed to a browser.
  await db
    .insert(appSettings)
    .values([
      { key: PUBLIC_KEY, value: generated.publicKey },
      { key: PRIVATE_KEY, value: generated.privateKey },
    ])
    .onConflictDoNothing();

  // Re-read rather than trusting what we generated, so the winner of any race
  // is the single source of truth.
  const [storedPublic, storedPrivate] = await Promise.all([
    readSetting(db, PUBLIC_KEY),
    readSetting(db, PRIVATE_KEY),
  ]);

  cached = {
    publicKey: storedPublic ?? generated.publicKey,
    privateKey: storedPrivate ?? generated.privateKey,
    subject,
  };
  return cached;
}

/** Only the public key ever reaches a browser. */
export async function getPublicVapidKey(db: Database = getDb()): Promise<string> {
  return (await getVapidKeys(db)).publicKey;
}
