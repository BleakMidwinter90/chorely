/**
 * Database client.
 *
 * Initialised lazily rather than at module scope: Next.js evaluates top-level
 * module code during `next build`, and a client constructed there would crash
 * the build on any machine that has not configured a database yet — including
 * the first CI run of a fresh clone.
 */

import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

import * as schema from './schema';

/**
 * Where the data lives.
 *
 * Defaults to a file next to the app, so `git clone && npm run dev` works with
 * no configuration at all. Point `DATABASE_URL` at a Turso URL for a hosted
 * deployment.
 */
const DEFAULT_DATABASE_URL = 'file:./data/chorely.db';

export type Database = LibSQLDatabase<typeof schema>;

let cached: { db: Database; client: Client } | null = null;

function create(): { db: Database; client: Client } {
  const url = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const client = createClient({
    url,
    // Only Turso needs a token; a local file must not be sent one.
    authToken: url.startsWith('file:') ? undefined : process.env.DATABASE_AUTH_TOKEN,
  });
  return { db: drizzle(client, { schema }), client };
}

/**
 * The shared database handle.
 *
 * Deliberately a function rather than a `Proxy`-wrapped export: proxies around
 * database clients break libraries that introspect the object, and fail in ways
 * that look like hangs rather than errors.
 */
export function getDb(): Database {
  cached ??= create();
  return cached.db;
}

/** Raw libSQL client, for migrations and pragmas. */
export function getClient(): Client {
  cached ??= create();
  return cached.client;
}

export { schema };
