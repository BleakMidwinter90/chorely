'use server';

/**
 * Server Actions.
 *
 * Every action that touches a household calls `requireIdentity()` first.
 * Server Actions are reachable by direct POST, so authorisation cannot live in
 * whichever component happened to render the button.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { requireIdentity, startSession, endSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db/client';
import { members } from '@/lib/db/schema';
import { MAX_EFFORT, MIN_EFFORT, type Recurrence } from '@/lib/domain/types';
import {
  archiveChore,
  createChore,
  createHousehold,
  findHouseholdByJoinCode,
  joinHousehold,
  reassignOpenOccurrences,
} from '@/lib/services/households';
import { completeOccurrence, householdToday, skipOccurrence } from '@/lib/services/scheduling';
import {
  addShoppingItem,
  clearBoughtItems,
  removeShoppingItem,
  setItemBought,
} from '@/lib/services/shopping';

const nameSchema = z.string().trim().min(1, 'Please enter a name').max(60);
const emojiSchema = z.string().trim().min(1).max(8).default('🙂');

/**
 * Shape returned to `useActionState`.
 *
 * Actions that can fail for a reason the user can act on return a message
 * rather than throwing, so the form can say what went wrong in place instead of
 * replacing the page with an error screen.
 */
export interface ActionState {
  error?: string;
}

/** Refresh every screen that reads the schedule or the ledger. */
function revalidateHousehold() {
  revalidatePath('/home');
  revalidatePath('/home/balance');
  revalidatePath('/home/chores');
  revalidatePath('/home/settings');
}

export async function createHouseholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      householdName: nameSchema,
      memberName: nameSchema,
      emoji: emojiSchema,
      timezone: z.string().trim().min(1).default('UTC'),
    })
    .safeParse({
      householdName: formData.get('householdName'),
      memberName: formData.get('memberName'),
      emoji: formData.get('emoji') || undefined,
      timezone: formData.get('timezone') || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form' };
  }

  const { household, member } = await createHousehold(parsed.data);
  await startSession(member.id, household.id);
  redirect('/home');
}

export async function joinHouseholdAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      joinCode: z.string().trim().min(1),
      memberName: nameSchema,
      emoji: emojiSchema,
    })
    .safeParse({
      joinCode: formData.get('joinCode'),
      memberName: formData.get('memberName'),
      emoji: formData.get('emoji') || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form' };
  }

  const household = await findHouseholdByJoinCode(parsed.data.joinCode);
  if (!household) {
    return { error: 'That invite link is not valid. Ask for a fresh one.' };
  }

  const member = await joinHousehold(household, parsed.data.memberName, parsed.data.emoji);
  await startSession(member.id, household.id);
  redirect('/home');
}

export async function completeChoreAction(formData: FormData) {
  const { member, household } = await requireIdentity();
  const occurrenceId = String(formData.get('occurrenceId') ?? '');
  if (!occurrenceId) return;

  await completeOccurrence(household, occurrenceId, member.id, householdToday(household));
  revalidateHousehold();
}

export async function skipChoreAction(formData: FormData) {
  const { household } = await requireIdentity();
  const occurrenceId = String(formData.get('occurrenceId') ?? '');
  if (!occurrenceId) return;

  await skipOccurrence(household, occurrenceId, householdToday(household));
  revalidateHousehold();
}

/**
 * Turns the simplified form into a `Recurrence`.
 *
 * The form deliberately does not expose the full rule shape. "Every 3 days" and
 * "every Monday and Thursday" cover almost every real household chore, and the
 * flexible/fixed toggle is presented as a plain-English question rather than as
 * a scheduling concept.
 */
const recurrenceSchema = z
  .object({
    repeat: z.enum(['days', 'weekly', 'monthly', 'once']),
    days: z.coerce.number().int().min(1).max(365).default(7),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
    dayOfMonth: z.coerce.number().int().min(1).max(31).default(1),
    flexible: z.boolean().default(true),
  })
  .transform((input): Recurrence => {
    switch (input.repeat) {
      case 'once':
        return { kind: 'once' };
      case 'weekly':
        return {
          kind: 'weekly',
          // Default to Monday rather than rejecting an empty selection.
          weekdays: (input.weekdays.length > 0 ? input.weekdays : [1]) as Recurrence extends {
            kind: 'weekly';
            weekdays: infer W;
          }
            ? W
            : never,
        };
      case 'monthly':
        return { kind: 'monthly', daysOfMonth: [input.dayOfMonth] };
      case 'days':
        return {
          kind: 'everyNDays',
          days: input.days,
          from: input.flexible ? 'completion' : 'start',
        };
    }
  });

export async function createChoreAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { household } = await requireIdentity();

  const parsed = z
    .object({
      name: nameSchema,
      icon: emojiSchema,
      effort: z.coerce.number().int().min(MIN_EFFORT).max(MAX_EFFORT),
      rotationMode: z.enum(['fair', 'rotate', 'fixed', 'anyone']),
      fixedMemberId: z.string().trim().optional(),
    })
    .safeParse({
      name: formData.get('name'),
      icon: formData.get('icon') || undefined,
      effort: formData.get('effort') ?? 2,
      rotationMode: formData.get('rotationMode') ?? 'fair',
      fixedMemberId: formData.get('fixedMemberId') || undefined,
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the form' };
  }

  const recurrence = recurrenceSchema.safeParse({
    repeat: formData.get('repeat') ?? 'days',
    days: formData.get('days') ?? 7,
    weekdays: formData.getAll('weekdays'),
    dayOfMonth: formData.get('dayOfMonth') ?? 1,
    flexible: formData.get('flexible') === 'on',
  });

  if (!recurrence.success) {
    return { error: 'That schedule does not look right' };
  }

  await createChore(
    household,
    { ...parsed.data, recurrence: recurrence.data },
    householdToday(household),
  );
  revalidateHousehold();
  redirect('/home');
}

export async function archiveChoreAction(formData: FormData) {
  const { household } = await requireIdentity();
  const choreId = String(formData.get('choreId') ?? '');
  if (!choreId) return;

  await archiveChore(household, choreId);
  revalidateHousehold();
}

/**
 * Adjust someone's agreed share of the work.
 *
 * Any member can change any weight, on purpose. There are no admins in a
 * household, and building a permission hierarchy into the place people sleep
 * would be a strange thing to do.
 */
export async function updateMemberWeightAction(formData: FormData): Promise<void> {
  const { household } = await requireIdentity();

  const parsed = z
    .object({
      memberId: z.string().trim().min(1),
      weight: z.coerce.number().min(0.1).max(5),
    })
    .safeParse({ memberId: formData.get('memberId'), weight: formData.get('weight') });

  if (!parsed.success) return;

  const db = getDb();
  // Scoped to the caller's household: a member id belonging to anyone else
  // simply does not resolve, so one household can never edit another's shares.
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, parsed.data.memberId), eq(members.householdId, household.id)))
    .limit(1);

  const target = rows[0];
  if (!target) return;

  await db.update(members).set({ weight: parsed.data.weight }).where(eq(members.id, target.id));
  await reassignOpenOccurrences(household);
  revalidateHousehold();
}

/**
 * Change when — and whether — this person is reminded.
 *
 * Scoped to the caller alone. Shares are a household-wide agreement anyone can
 * adjust, but nobody gets to decide when somebody else's phone buzzes.
 */
export async function updateReminderPrefsAction(formData: FormData): Promise<void> {
  const { member } = await requireIdentity();

  const parsed = z
    .object({
      remindersEnabled: z.boolean(),
      reminderHour: z.coerce.number().int().min(0).max(23),
    })
    .safeParse({
      remindersEnabled: formData.get('remindersEnabled') === 'on',
      reminderHour: formData.get('reminderHour') ?? 9,
    });

  if (!parsed.success) return;

  await getDb()
    .update(members)
    .set({
      remindersEnabled: parsed.data.remindersEnabled,
      reminderHour: parsed.data.reminderHour,
      // Clear the stamp so a changed time can take effect today rather than
      // silently waiting until tomorrow.
      lastRemindedOn: null,
    })
    .where(eq(members.id, member.id));

  revalidatePath('/home/settings');
}

/* ---------------------------------------------------------------- shopping */

export async function addShoppingItemAction(formData: FormData): Promise<void> {
  const { household, member } = await requireIdentity();

  const parsed = z
    .object({ name: z.string().trim().min(1).max(80), note: z.string().trim().max(120).optional() })
    .safeParse({
      name: formData.get('name'),
      note: formData.get('note') || undefined,
    });

  // An empty submit is someone hitting enter on a blank field, not an error
  // worth interrupting them for.
  if (!parsed.success) return;

  await addShoppingItem(household, { ...parsed.data, addedById: member.id });
  revalidatePath('/home/shopping');
}

export async function toggleShoppingItemAction(formData: FormData): Promise<void> {
  const { household, member } = await requireIdentity();

  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;

  await setItemBought(household, itemId, formData.get('bought') === '1', member.id);
  revalidatePath('/home/shopping');
}

export async function removeShoppingItemAction(formData: FormData): Promise<void> {
  const { household } = await requireIdentity();

  const itemId = String(formData.get('itemId') ?? '');
  if (!itemId) return;

  await removeShoppingItem(household, itemId);
  revalidatePath('/home/shopping');
}

export async function clearBoughtItemsAction(): Promise<void> {
  const { household } = await requireIdentity();
  await clearBoughtItems(household);
  revalidatePath('/home/shopping');
}

export async function signOutAction() {
  await endSession();
  redirect('/');
}
