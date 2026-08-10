/**
 * Database schema.
 *
 * SQLite via libSQL, which covers both deployment stories from one driver: a
 * local file for self-hosting (`file:./data/chorely.db`) and Turso for a
 * hosted instance. A household's entire dataset is a few kilobytes, so a
 * single file is genuinely the right tool rather than a compromise.
 */

import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { Recurrence, RotationMode } from '../domain/types';

const now = sql`(unixepoch() * 1000)`;

/**
 * A household: the unit of sharing. Everything else hangs off one of these.
 *
 * There are no user accounts in chorely. You create a household, you get a
 * link, and the people you live with open it. Requiring five housemates to
 * each create an account and verify an email is how a chore app dies in week
 * one.
 */
export const households = sqliteTable('households', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Bearer secret embedded in the invite link. Long enough not to be guessed. */
  joinCode: text('join_code').notNull(),
  /** IANA zone. Decides what "today" means for this household, not the server. */
  timezone: text('timezone').notNull().default('UTC'),
  /** Trailing window the balance score is computed over. */
  fairnessWindowDays: integer('fairness_window_days').notNull().default(28),
  /** ISO 4217, for shared expenses. */
  currency: text('currency').notNull().default('GBP'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

export const members = sqliteTable(
  'members',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Avatar. An emoji rather than an upload keeps onboarding to one tap. */
    emoji: text('emoji').notNull().default('🙂'),
    /**
     * Agreed share of the household's work, relative to other members.
     * 1 for an even split; 0.5 for someone who has agreed to do half as much.
     */
    weight: real('weight').notNull().default(1),
    /** Join order. Also the visiting order for `rotate` chores. */
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Away period, `YYYY-MM-DD` inclusive at both ends.
     *
     * While away, someone is skipped by assignment *and* has their expected
     * share scaled down in proportion. Pausing only the assignment would leave
     * them coming home to an app claiming they are behind.
     */
    awayFrom: text('away_from'),
    awayUntil: text('away_until'),
    /** Whether this person wants a daily reminder at all. Off means off. */
    remindersEnabled: integer('reminders_enabled', { mode: 'boolean' }).notNull().default(true),
    /**
     * Local hour, 0-23, at which they have agreed to be told.
     *
     * Per member rather than per household: one person is up at six and
     * another would like to be left alone until the evening.
     */
    reminderHour: integer('reminder_hour').notNull().default(9),
    /**
     * `YYYY-MM-DD` of the last reminder sent.
     *
     * This is what caps reminders at one a day, which in turn is what makes the
     * sender safe to call as often as we like - and that is what lets a
     * self-hosted instance poll on a timer instead of needing real cron.
     */
    lastRemindedOn: text('last_reminded_on'),
    /**
     * Members are archived, never deleted: their completions have to stay in
     * the ledger or past fairness scores silently rewrite themselves.
     */
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('members_household_idx').on(table.householdId, table.sortOrder)],
);

export const chores = sqliteTable(
  'chores',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('🧹'),
    /** 1–5. Scrubbing the oven is not taking out a bin. */
    effort: integer('effort').notNull().default(2),
    recurrence: text('recurrence', { mode: 'json' }).notNull().$type<Recurrence>(),
    /**
     * Free text shown alongside the chore.
     *
     * For the practical knowledge that otherwise lives in one person's head -
     * where the hoover bags are kept, which bin goes out on which week. That
     * knowledge is a real part of why chores end up unevenly distributed.
     */
    notes: text('notes'),
    rotationMode: text('rotation_mode').notNull().$type<RotationMode>().default('fair'),
    /** Owner, for `fixed` rotation. */
    fixedMemberId: text('fixed_member_id').references(() => members.id, { onDelete: 'set null' }),
    /** Schedule anchor, `YYYY-MM-DD`. */
    startOn: text('start_on').notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('chores_household_idx').on(table.householdId)],
);

/**
 * One scheduled instance of a chore.
 *
 * Exactly one `open` occurrence exists per active chore at a time; completing
 * it marks it done and schedules the next. Keeping completed rows here rather
 * than in a separate table means the fairness ledger is just a query over this
 * table, and every completion stays attached to the occurrence it settled.
 */
export const occurrences = sqliteTable(
  'occurrences',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    choreId: text('chore_id')
      .notNull()
      .references(() => chores.id, { onDelete: 'cascade' }),
    /** `YYYY-MM-DD` in the household's timezone. */
    dueOn: text('due_on').notNull(),
    /** Whose turn it is. Null for `anyone` chores, or when nobody is eligible. */
    assigneeId: text('assignee_id').references(() => members.id, { onDelete: 'set null' }),
    status: text('status').notNull().$type<OccurrenceStatus>().default('open'),
    /** Who actually did it — not always who it was assigned to, which is fine. */
    completedById: text('completed_by_id').references(() => members.id, { onDelete: 'set null' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    /**
     * `YYYY-MM-DD` this occurrence stopped being open — whether it was done or
     * skipped.
     *
     * Both outcomes advance the schedule (a skipped chore must not sit overdue
     * forever), but only `done` earns effort in the fairness ledger. Hence
     * "resolved" rather than "completed": the two readers of this column want
     * different things from it.
     */
    resolvedOn: text('resolved_on'),
    /**
     * Effort points as they were at the moment of completion.
     *
     * Snapshotted deliberately: re-pricing a chore from 5 points to 2 must not
     * retroactively rewrite who was pulling their weight last month.
     */
    effortAwarded: integer('effort_awarded'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [
    // Drives the Today view.
    index('occurrences_open_idx').on(table.householdId, table.status, table.dueOn),
    // Drives the fairness ledger.
    index('occurrences_ledger_idx').on(table.householdId, table.resolvedOn),
    index('occurrences_chore_idx').on(table.choreId, table.status),
  ],
);

export type OccurrenceStatus = 'open' | 'done' | 'skipped';

/**
 * A device that has joined a household.
 *
 * The cookie holds a random token; only its SHA-256 hash is stored, so a leaked
 * database backup does not hand over live sessions.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [uniqueIndex('sessions_member_idx').on(table.tokenHash, table.memberId)],
);

/**
 * Instance-wide key/value settings.
 *
 * Currently just the VAPID keypair, generated on first use. Self-hosters should
 * not have to run a key-generation command before notifications work - the app
 * mints its own and keeps them next to the data they belong to.
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
});

/**
 * A browser that has agreed to receive push notifications.
 *
 * Keyed by endpoint, because that is what the push service considers unique;
 * one person with a phone and a laptop has two rows.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('push_member_idx').on(table.memberId)],
);

/**
 * The shared shopping list.
 *
 * Chores and groceries are the two things every shared household actually
 * coordinates, and keeping them in one app is what stops the list drifting back
 * into a group chat where nothing can be ticked off.
 *
 * Bought items are kept rather than deleted: seeing what was picked up, and by
 * whom, is most of the value on the walk home.
 */
export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Free text: brand, quantity, "the good one". Deliberately unstructured. */
    note: text('note'),
    addedById: text('added_by_id').references(() => members.id, { onDelete: 'set null' }),
    boughtById: text('bought_by_id').references(() => members.id, { onDelete: 'set null' }),
    boughtAt: integer('bought_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('shopping_household_idx').on(table.householdId, table.boughtAt)],
);

/**
 * A record that someone reminded someone else about a chore.
 *
 * Exists purely to rate-limit. One nudge per chore per day, household-wide -
 * not per sender, or three housemates each sending "just one" reminder is four
 * notifications about the same bin, which is how an app gets muted.
 */
export const nudges = sqliteTable(
  'nudges',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    occurrenceId: text('occurrence_id')
      .notNull()
      .references(() => occurrences.id, { onDelete: 'cascade' }),
    fromMemberId: text('from_member_id').references(() => members.id, { onDelete: 'set null' }),
    toMemberId: text('to_member_id').references(() => members.id, { onDelete: 'set null' }),
    /** `YYYY-MM-DD` in household time. */
    sentOn: text('sent_on').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('nudges_occurrence_idx').on(table.occurrenceId, table.sentOn)],
);

/**
 * A long-lived token for scripts, automations and native clients.
 *
 * Stored only as a SHA-256 hash, like sessions: a leaked database backup must
 * not hand over working credentials. The plaintext is shown once, at creation,
 * and never again.
 */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    /** What it is for, so an unrecognised token can be revoked with confidence. */
    name: text('name').notNull(),
    /** First eight characters, to identify a token in a list without storing it. */
    prefix: text('prefix').notNull(),
    createdById: text('created_by_id').references(() => members.id, { onDelete: 'set null' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('api_tokens_household_idx').on(table.householdId)],
);

/**
 * A shared cost somebody fronted.
 *
 * Amounts are integer minor units — pence, cents. Money in floating point is a
 * well-known way to end up a penny out and unable to explain why, and being
 * unable to explain why is fatal for a feature whose whole job is settling an
 * argument about money.
 */
export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    /** Total, in minor units. */
    amount: integer('amount').notNull(),
    paidById: text('paid_by_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /**
     * When this was settled up. Settled expenses stay in the ledger as history
     * but drop out of the running total.
     */
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  },
  (table) => [index('expenses_household_idx').on(table.householdId, table.settledAt)],
);

/**
 * One person's part of one expense.
 *
 * Stored explicitly rather than recomputed from the member list, for the same
 * reason effort is snapshotted onto a completed chore: somebody joining or
 * leaving next month must not silently rewrite what was owed last month.
 */
export const expenseShares = sqliteTable(
  'expense_shares',
  {
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** This person's share, in minor units. */
    amount: integer('amount').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.memberId] }),
    index('expense_shares_member_idx').on(table.memberId),
  ],
);

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(members),
  chores: many(chores),
  occurrences: many(occurrences),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  household: one(households, {
    fields: [members.householdId],
    references: [households.id],
  }),
  occurrences: many(occurrences),
}));

export const choresRelations = relations(chores, ({ one, many }) => ({
  household: one(households, {
    fields: [chores.householdId],
    references: [households.id],
  }),
  occurrences: many(occurrences),
}));

export const occurrencesRelations = relations(occurrences, ({ one }) => ({
  chore: one(chores, { fields: [occurrences.choreId], references: [chores.id] }),
  assignee: one(members, { fields: [occurrences.assigneeId], references: [members.id] }),
  completedBy: one(members, { fields: [occurrences.completedById], references: [members.id] }),
}));

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Chore = typeof chores.$inferSelect;
export type Occurrence = typeof occurrences.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
