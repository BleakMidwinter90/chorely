/**
 * The in-process reminder scheduler.
 *
 * A self-hosted app cannot assume a cron daemon exists. Telling someone running
 * a container on a NAS to "also set up a cron job that curls this endpoint" is
 * the point at which they stop, so chorely runs its own timer instead.
 *
 * This works precisely because the reminder rules are idempotent per day: a
 * fifteen-minute tick can call the dispatcher all it likes, and at most one
 * reminder per person per day ever goes out. There is no locking here and none
 * is needed for the single-container deployment this targets.
 *
 * An HTTP endpoint exists too (`/api/cron/reminders`) for anyone running
 * several replicas, or who would simply rather drive it externally.
 */

import { dispatchDueReminders } from './services/reminders';

const TICK_MS = 15 * 60 * 1000;

declare global {
  var __chorelyScheduler: NodeJS.Timeout | undefined;
}

/**
 * Start the timer, once per process.
 *
 * The handle is stashed on `globalThis` because a development server reloads
 * modules on edit, and a fresh interval per reload would stack up until the
 * dispatcher ran continuously.
 */
export function startScheduler(): void {
  if (process.env.CHORELY_DISABLE_SCHEDULER === '1') return;
  if (globalThis.__chorelyScheduler) return;

  globalThis.__chorelyScheduler = setInterval(() => {
    dispatchDueReminders().catch((error) => {
      // A failed pass must never take the server with it; the next tick retries.
      console.error('[chorely] reminder pass failed:', error);
    });
  }, TICK_MS);

  // Node keeps the process alive for pending timers. This one should never be
  // the reason a container refuses to shut down.
  globalThis.__chorelyScheduler.unref?.();
}
