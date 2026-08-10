/**
 * Migrations, applied automatically on first database access.
 *
 * Self-hosted users should not have to run a migration command after every
 * `docker pull`. The upgrade path for someone running this on a Raspberry Pi
 * in a cupboard has to be "pull the new image", or they will simply never
 * upgrade.
 */

import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { getClient, getDb } from './client';

let applied: Promise<void> | null = null;

async function ensureDirectoryExists(): Promise<void> {
  const url = process.env.DATABASE_URL || 'file:./data/chorely.db';
  if (!url.startsWith('file:')) return;
  // libSQL will not create a missing parent directory for us.
  await mkdir(dirname(url.slice('file:'.length)), { recursive: true });
}

/**
 * Bring the database up to date. Safe to call on every request — the work
 * happens once per process and every later caller awaits the same promise.
 */
export function ensureMigrated(): Promise<void> {
  applied ??= (async () => {
    await ensureDirectoryExists();
    // Off by default in SQLite, and this schema leans on cascading deletes.
    await getClient().execute('PRAGMA foreign_keys = ON');
    await migrate(getDb(), { migrationsFolder: 'lib/db/migrations' });
  })().catch((error) => {
    // Don't cache a failed run: a transient permissions problem on a mounted
    // volume should be retryable without restarting the container.
    applied = null;
    throw error;
  });

  return applied;
}
