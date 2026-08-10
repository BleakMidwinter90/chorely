/**
 * Server start-up hook.
 *
 * Next calls `register()` once per server process, which is the one place a
 * self-hosted instance can start its own background work without asking the
 * person running it to configure anything.
 */
export async function register() {
  // Only the Node.js server runs timers; the edge runtime has no such concept.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
