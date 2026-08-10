/**
 * Calendar-date arithmetic on `YYYY-MM-DD` strings.
 *
 * Chores are day-granular, never time-granular: "clean the bathroom" is due on
 * a day, not at 14:32. Working in date strings with UTC-midnight internals
 * sidesteps every daylight-saving and timezone bug that would otherwise show up
 * as a chore silently going due a day early twice a year.
 */

import type { IsoDate, Weekday } from './types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  // Rejects impossible dates like 2024-02-31, which `Date` would silently roll over.
  return toIsoDate(parseIsoDate(value)) === value;
}

export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new TypeError(`Expected a YYYY-MM-DD date, received: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Parse to a `Date` at UTC midnight. */
export function parseIsoDate(value: IsoDate): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(date).getTime() + days * MS_PER_DAY));
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(to: IsoDate, from: IsoDate): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

export function weekdayOf(date: IsoDate): Weekday {
  return parseIsoDate(date).getUTCDay() as Weekday;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** Days in the month containing `date`. */
export function daysInMonth(date: IsoDate): number {
  const d = parseIsoDate(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** First day of the month containing `date`. */
export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = parseIsoDate(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIsoDate(target);
}

/**
 * "Today" in a given IANA timezone.
 *
 * A household in Auckland and a server in Virginia must agree on which day it
 * is, and the household wins.
 */
export function todayInTimezone(timeZone: string, now: Date = new Date()): IsoDate {
  // `en-CA` formats as YYYY-MM-DD, which is exactly our wire format.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
