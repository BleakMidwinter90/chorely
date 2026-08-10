import { authenticate, UNAUTHORIZED } from '@/lib/api/auth';
import { getAgenda } from '@/lib/services/households';
import { householdToday } from '@/lib/services/scheduling';

/**
 * What needs doing right now.
 *
 * The endpoint a wall tablet, a Home Assistant card or a native client would
 * poll. Shapes are flattened rather than exposing table rows directly, so the
 * schema can change without breaking anyone's script.
 */
export async function GET(request: Request) {
  const caller = await authenticate(request);
  if (!caller) return UNAUTHORIZED();

  const today = householdToday(caller.household);
  const agenda = await getAgenda(caller.household, today);

  return Response.json({
    today,
    household: { id: caller.household.id, name: caller.household.name },
    items: agenda.map((item) => ({
      id: item.occurrence.id,
      chore: {
        id: item.chore.id,
        name: item.chore.name,
        icon: item.chore.icon,
        effort: item.chore.effort,
        notes: item.chore.notes,
      },
      dueOn: item.occurrence.dueOn,
      status: item.status,
      assignee: item.assignee
        ? { id: item.assignee.id, name: item.assignee.name, emoji: item.assignee.emoji }
        : null,
    })),
  });
}
