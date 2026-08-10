import { ensureMigrated } from '@/lib/db/migrate';
import { safeEquals } from '@/lib/auth/session';
import { dispatchDueReminders } from '@/lib/services/reminders';

/**
 * Reminder dispatch, over HTTP.
 *
 * The app runs its own timer, so this exists for people running several
 * replicas — where an in-process timer would fire once per replica — or who
 * would simply rather drive it from their own scheduler.
 *
 * Safe to call as often as you like: the once-a-day gate in
 * `lib/domain/reminders` means extra calls do nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Unprotected by default, because the endpoint cannot do anything harmful:
  // at worst it sends reminders that were already due. Set CRON_SECRET to lock
  // it down anyway if the instance is exposed to the internet.
  if (secret) {
    const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!safeEquals(provided, secret)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  await ensureMigrated();
  const result = await dispatchDueReminders();

  return Response.json({ ok: true, ...result });
}
