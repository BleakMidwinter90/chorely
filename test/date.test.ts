import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  assertIsoDate,
  daysInMonth,
  diffDays,
  isIsoDate,
  maxDate,
  parseIsoDate,
  startOfMonth,
  todayInTimezone,
  toIsoDate,
  weekdayOf,
} from '../lib/domain/date';

describe('isIsoDate', () => {
  it('accepts well-formed calendar dates', () => {
    expect(isIsoDate('2024-01-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects malformed strings', () => {
    for (const bad of ['2024-1-1', '24-01-01', '2024/01/01', 'today', '', '2024-01-01T00:00:00Z']) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });

  it('rejects dates that do not exist rather than rolling them over', () => {
    expect(isIsoDate('2024-02-31')).toBe(false);
    expect(isIsoDate('2023-02-29')).toBe(false); // not a leap year
    expect(isIsoDate('2024-13-01')).toBe(false);
    expect(isIsoDate('2024-00-10')).toBe(false);
  });

  it('throws with a useful message when asserting', () => {
    expect(() => assertIsoDate('nope')).toThrow(/YYYY-MM-DD/);
    expect(assertIsoDate('2024-06-01')).toBe('2024-06-01');
  });
});

describe('arithmetic', () => {
  it('adds and subtracts days across month and year boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
  });

  it('is unaffected by daylight saving transitions', () => {
    // US DST starts 2024-03-10; a naive local-time implementation loses an hour
    // here and can report 0 or 2 days.
    expect(diffDays('2024-03-11', '2024-03-09')).toBe(2);
    expect(addDays('2024-03-09', 2)).toBe('2024-03-11');
    // EU DST ends 2024-10-27.
    expect(diffDays('2024-10-28', '2024-10-26')).toBe(2);
  });

  it('measures signed differences', () => {
    expect(diffDays('2024-01-10', '2024-01-01')).toBe(9);
    expect(diffDays('2024-01-01', '2024-01-10')).toBe(-9);
    expect(diffDays('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('round-trips through Date', () => {
    expect(toIsoDate(parseIsoDate('2024-07-04'))).toBe('2024-07-04');
  });

  it('reports weekdays', () => {
    expect(weekdayOf('2024-01-07')).toBe(0); // Sunday
    expect(weekdayOf('2024-01-08')).toBe(1); // Monday
    expect(weekdayOf('2024-01-13')).toBe(6); // Saturday
  });

  it('picks the later of two dates', () => {
    expect(maxDate('2024-01-01', '2024-06-01')).toBe('2024-06-01');
    expect(maxDate('2024-06-01', '2024-01-01')).toBe('2024-06-01');
    expect(maxDate('2024-01-01', '2024-01-01')).toBe('2024-01-01');
  });
});

describe('month helpers', () => {
  it('counts days in a month, including leap Februaries', () => {
    expect(daysInMonth('2024-02-10')).toBe(29);
    expect(daysInMonth('2023-02-10')).toBe(28);
    expect(daysInMonth('2024-04-10')).toBe(30);
    expect(daysInMonth('2024-12-10')).toBe(31);
  });

  it('finds the start of a month', () => {
    expect(startOfMonth('2024-08-23')).toBe('2024-08-01');
  });

  it('adds months, clamping to the shorter target month', () => {
    expect(addMonths('2024-01-15', 1)).toBe('2024-02-15');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // clamped, leap year
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28'); // clamped
    expect(addMonths('2024-12-15', 1)).toBe('2025-01-15');
    expect(addMonths('2024-01-15', -1)).toBe('2023-12-15');
  });
});

describe('todayInTimezone', () => {
  it('resolves the household timezone, not the server timezone', () => {
    // 2024-06-01T12:00Z is still 2024-06-01 in New York but already
    // 2024-06-02 in Auckland.
    const noonUtc = new Date('2024-06-01T12:00:00Z');
    expect(todayInTimezone('America/New_York', noonUtc)).toBe('2024-06-01');
    expect(todayInTimezone('Pacific/Auckland', noonUtc)).toBe('2024-06-02');
    expect(todayInTimezone('UTC', noonUtc)).toBe('2024-06-01');
  });

  it('handles the day rolling over just before midnight', () => {
    const lateUtc = new Date('2024-06-01T23:30:00Z');
    expect(todayInTimezone('UTC', lateUtc)).toBe('2024-06-01');
    expect(todayInTimezone('Europe/Berlin', lateUtc)).toBe('2024-06-02');
  });
});
