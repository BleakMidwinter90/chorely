/**
 * A throwaway in-memory database per test.
 *
 * Migrations run from the same folder the app ships, so these tests fail if a
 * migration is ever forgotten — which is the failure most worth catching.
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import * as schema from '../../lib/db/schema';
import type { Database } from '../../lib/db/client';

export async function createTestDb(): Promise<Database> {
  const client = createClient({ url: ':memory:' });
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'lib/db/migrations' });
  return db;
}
