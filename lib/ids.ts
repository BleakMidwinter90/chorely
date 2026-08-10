import { customAlphabet, nanoid } from 'nanoid';

/**
 * Prefixed, URL-safe identifiers.
 *
 * The prefix costs three characters and pays for itself the first time you read
 * a log line or a foreign key and know immediately what you are looking at.
 */
const PREFIXES = {
  household: 'hh',
  member: 'mb',
  chore: 'ch',
  occurrence: 'oc',
} as const;

export function createId(kind: keyof typeof PREFIXES): string {
  return `${PREFIXES[kind]}_${nanoid(16)}`;
}

/**
 * Invite codes.
 *
 * No vowels (so the generator cannot produce a word nobody wants in their
 * group chat) and no visually ambiguous characters, because these get read
 * aloud and typed by hand. ~14 chars of this alphabet is comfortably beyond
 * guessing, and the code is a bearer secret — anyone holding it can join.
 */
const inviteAlphabet = customAlphabet('23456789bcdfghjkmnpqrstvwxz', 14);

export function createJoinCode(): string {
  return inviteAlphabet();
}
