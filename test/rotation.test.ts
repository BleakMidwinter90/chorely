import { describe, expect, it } from 'vitest';

import { pickAssignee, type RotationCandidate } from '../lib/domain/rotation';

function candidate(
  memberId: string,
  recentPoints = 0,
  extra: Partial<RotationCandidate> = {},
): RotationCandidate {
  return { memberId, weight: 1, recentPoints, ...extra };
}

const ANA_BEN_CAL = [candidate('ana'), candidate('ben'), candidate('cal')];

describe('pickAssignee — empty household', () => {
  it('returns null for every mode when there is nobody to assign to', () => {
    for (const mode of ['rotate', 'fair', 'fixed', 'anyone'] as const) {
      expect(pickAssignee(mode, [])).toBeNull();
    }
  });
});

describe('pickAssignee — anyone', () => {
  it('leaves the chore unclaimed', () => {
    expect(pickAssignee('anyone', ANA_BEN_CAL)).toBeNull();
  });
});

describe('pickAssignee — fixed', () => {
  it('always returns the owner', () => {
    expect(pickAssignee('fixed', ANA_BEN_CAL, { fixedMemberId: 'ben' })).toBe('ben');
  });

  it('falls back to the fairest pick when the owner has left', () => {
    const candidates = [candidate('ana', 10), candidate('ben', 2)];
    expect(pickAssignee('fixed', candidates, { fixedMemberId: 'departed' })).toBe('ben');
  });

  it('falls back when no owner was ever set', () => {
    const candidates = [candidate('ana', 10), candidate('ben', 2)];
    expect(pickAssignee('fixed', candidates)).toBe('ben');
  });
});

describe('pickAssignee — rotate', () => {
  it('advances to the next member in order', () => {
    expect(pickAssignee('rotate', ANA_BEN_CAL, { lastAssigneeId: 'ana' })).toBe('ben');
    expect(pickAssignee('rotate', ANA_BEN_CAL, { lastAssigneeId: 'ben' })).toBe('cal');
  });

  it('wraps around the end of the list', () => {
    expect(pickAssignee('rotate', ANA_BEN_CAL, { lastAssigneeId: 'cal' })).toBe('ana');
  });

  it('starts at the top when there is no previous assignee', () => {
    expect(pickAssignee('rotate', ANA_BEN_CAL)).toBe('ana');
  });

  it('starts at the top when the previous assignee has left the household', () => {
    expect(pickAssignee('rotate', ANA_BEN_CAL, { lastAssigneeId: 'departed' })).toBe('ana');
  });

  it('keeps working in a household of one', () => {
    const solo = [candidate('ana')];
    expect(pickAssignee('rotate', solo, { lastAssigneeId: 'ana' })).toBe('ana');
  });

  it('visits everyone exactly once per cycle', () => {
    const seen: string[] = [];
    let last: string | undefined;
    for (let i = 0; i < 3; i++) {
      last = pickAssignee('rotate', ANA_BEN_CAL, { lastAssigneeId: last })!;
      seen.push(last);
    }
    expect(new Set(seen).size).toBe(3);
  });
});

describe('pickAssignee — fair', () => {
  it('picks whoever has done the least so far', () => {
    const candidates = [candidate('ana', 10), candidate('ben', 3), candidate('cal', 7)];
    expect(pickAssignee('fair', candidates)).toBe('ben');
  });

  it('measures load against agreed share, not raw points', () => {
    // Ana agreed to do twice as much, so 10 points for her is a lighter load
    // than 6 points for Ben.
    const candidates = [
      candidate('ana', 10, { weight: 2 }), // 5.0 per unit weight
      candidate('ben', 6, { weight: 1 }), // 6.0 per unit weight
    ];
    expect(pickAssignee('fair', candidates)).toBe('ana');
  });

  it('breaks ties toward whoever has gone longest without this chore', () => {
    const candidates = [
      candidate('ana', 5, { lastDidChoreOn: '2024-06-10' }),
      candidate('ben', 5, { lastDidChoreOn: '2024-05-01' }),
      candidate('cal', 5, { lastDidChoreOn: '2024-06-01' }),
    ];
    expect(pickAssignee('fair', candidates)).toBe('ben');
  });

  it('prefers someone who has never done the chore over someone who has', () => {
    const candidates = [
      candidate('ana', 5, { lastDidChoreOn: '2024-05-01' }),
      candidate('ben', 5), // never done it
    ];
    expect(pickAssignee('fair', candidates)).toBe('ben');
  });

  it('is deterministic when everything else is equal', () => {
    const candidates = [candidate('cal', 5), candidate('ana', 5), candidate('ben', 5)];
    expect(pickAssignee('fair', candidates)).toBe('ana');
    // Input order must not change the answer.
    expect(pickAssignee('fair', [...candidates].reverse())).toBe('ana');
  });

  it("does not mutate the caller's array", () => {
    const candidates = [candidate('cal', 9), candidate('ana', 1)];
    const order = candidates.map((c) => c.memberId);
    pickAssignee('fair', candidates);
    expect(candidates.map((c) => c.memberId)).toEqual(order);
  });

  it('self-corrects: repeatedly assigning fairly evens the load out', () => {
    const load = new Map([
      ['ana', 0],
      ['ben', 0],
      ['cal', 0],
    ]);
    for (let i = 0; i < 30; i++) {
      const picked = pickAssignee(
        'fair',
        [...load].map(([memberId, recentPoints]) => candidate(memberId, recentPoints)),
      )!;
      load.set(picked, load.get(picked)! + 2);
    }
    const values = [...load.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(2);
  });
});
