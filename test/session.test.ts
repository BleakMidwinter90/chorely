import { describe, expect, it } from 'vitest';

import { isSecureRequest, safeEquals } from '../lib/auth/session';

/**
 * These look like trivia. They are not.
 *
 * Getting this wrong marks the session cookie `Secure` on a plain-HTTP origin,
 * the browser silently discards it, and every self-hosted install on a home
 * network becomes impossible to sign in to — while still rendering pages
 * perfectly, so the symptom looks like a bug anywhere except here.
 */
describe('isSecureRequest', () => {
  it('is false without a proxy header — the plain-HTTP LAN case', () => {
    // http://192.168.1.20:3000, which is how most people will actually run this.
    expect(isSecureRequest(null)).toBe(false);
    expect(isSecureRequest('')).toBe(false);
    expect(isSecureRequest('http')).toBe(false);
  });

  it('is true behind a proxy terminating TLS', () => {
    expect(isSecureRequest('https')).toBe(true);
    expect(isSecureRequest('HTTPS')).toBe(true);
    expect(isSecureRequest(' https ')).toBe(true);
  });

  it('reads only the client-facing entry of a proxy chain', () => {
    expect(isSecureRequest('https,http')).toBe(true);
    expect(isSecureRequest('https, http, http')).toBe(true);
    expect(isSecureRequest('http,https')).toBe(false);
  });

  it('lets the operator force it either way', () => {
    // For a proxy that terminates TLS but does not set the header.
    expect(isSecureRequest(null, '1')).toBe(true);
    expect(isSecureRequest('https', '0')).toBe(false);
  });

  it('ignores an unset or meaningless override', () => {
    expect(isSecureRequest('https', undefined)).toBe(true);
    expect(isSecureRequest('https', '')).toBe(true);
    expect(isSecureRequest(null, 'yes')).toBe(false);
  });
});

describe('safeEquals', () => {
  it('matches identical strings', () => {
    expect(safeEquals('abc', 'abc')).toBe(true);
  });

  it('rejects different strings without throwing on a length mismatch', () => {
    expect(safeEquals('abc', 'abd')).toBe(false);
    expect(safeEquals('abc', 'abcdef')).toBe(false);
    expect(safeEquals('', 'a')).toBe(false);
  });
});
