import { describe, expect, it } from 'vitest';

import { canNudge, nudgeMessage, refusalMessage, type NudgeRequest } from '../lib/domain/nudges';

const TODAY = '2024-06-10';

function request(overrides: Partial<NudgeRequest> = {}): NudgeRequest {
  return { fromMemberId: 'ana', assigneeId: 'ben', dueOn: TODAY, ...overrides };
}

describe('canNudge', () => {
  it('allows a nudge about someone else’s chore that is due', () => {
    expect(canNudge(request(), TODAY)).toEqual({ allowed: true });
  });

  it('allows it for an overdue chore', () => {
    expect(canNudge(request({ dueOn: '2024-06-01' }), TODAY)).toEqual({ allowed: true });
  });

  it('refuses when the chore belongs to nobody', () => {
    expect(canNudge(request({ assigneeId: null }), TODAY)).toEqual({
      allowed: false,
      reason: 'unassigned',
    });
  });

  it('refuses nudging yourself', () => {
    expect(canNudge(request({ assigneeId: 'ana' }), TODAY)).toEqual({
      allowed: false,
      reason: 'self',
    });
  });

  it('refuses chasing someone about a chore that is not due yet', () => {
    // Nagging about tomorrow is nagging by any reasonable definition.
    expect(canNudge(request({ dueOn: '2024-06-11' }), TODAY)).toEqual({
      allowed: false,
      reason: 'not-due-yet',
    });
  });

  it('allows only one nudge per chore per day, across the whole household', () => {
    // The cap is per occurrence, not per sender. Three housemates each sending
    // "just one" reminder is three buzzes about one bin.
    const alreadySent = request({ lastNudgedOn: TODAY });
    expect(canNudge(alreadySent, TODAY)).toEqual({
      allowed: false,
      reason: 'already-nudged-today',
    });
    // A different sender gets the same refusal.
    expect(canNudge({ ...alreadySent, fromMemberId: 'cal' }, TODAY)).toEqual({
      allowed: false,
      reason: 'already-nudged-today',
    });
  });

  it('lets the cap lapse the next day', () => {
    expect(canNudge(request({ lastNudgedOn: '2024-06-09' }), TODAY)).toEqual({ allowed: true });
  });
});

describe('the wording', () => {
  it('names the chore and never implies a failing', () => {
    const message = nudgeMessage('Clean the bathroom', 'Ana');
    expect(message.title).toBe('Clean the bathroom');
    // "mentioned" rather than "reminded" — the latter presumes you forgot.
    expect(message.body).toBe('Ana mentioned this one.');
  });

  it('never scolds, in any message the feature can produce', () => {
    const texts = [
      ...Object.values(nudgeMessage('Bins', 'Ana')),
      refusalMessage('unassigned'),
      refusalMessage('self'),
      refusalMessage('not-due-yet'),
      refusalMessage('already-nudged-today'),
    ];

    for (const text of texts) {
      expect(text).not.toMatch(/!|forgot|still|hurry|please|remember|overdue|late|your turn to/i);
    }
  });

  it('explains every refusal in plain language', () => {
    for (const reason of ['unassigned', 'self', 'not-due-yet', 'already-nudged-today'] as const) {
      expect(refusalMessage(reason).length).toBeGreaterThan(10);
    }
  });
});
