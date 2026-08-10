import { authenticate, UNAUTHORIZED } from '@/lib/api/auth';
import { getHouseholdBalance } from '@/lib/services/ledger';
import { householdToday } from '@/lib/services/scheduling';

/**
 * The balance score and per-member load.
 *
 * The endpoint behind a wall-mounted dashboard, or a weekly digest somebody
 * wires up themselves.
 */
export async function GET(request: Request) {
  const caller = await authenticate(request);
  if (!caller) return UNAUTHORIZED();

  const today = householdToday(caller.household);
  const { report, members } = await getHouseholdBalance(caller.household, today);
  const byId = new Map(members.map((member) => [member.id, member]));

  return Response.json({
    windowStart: report.windowStart,
    windowEnd: report.windowEnd,
    balance: report.balance,
    totalPoints: report.totalPoints,
    members: report.members.map((load) => ({
      id: load.memberId,
      name: byId.get(load.memberId)?.name ?? null,
      points: load.points,
      expected: Math.round(load.expected * 10) / 10,
      sharePct: Math.round(load.sharePct * 10) / 10,
      targetPct: Math.round(load.targetPct * 10) / 10,
    })),
  });
}
