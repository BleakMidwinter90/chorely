/**
 * Seeds a demo household so the app can be looked at with something in it.
 *
 * An empty app doesn't show what this project is for — the balance score is the
 * whole pitch, and it needs a few weeks of history to say anything. This writes
 * a realistic three-person share house with a deliberately uneven split.
 *
 *   node scripts/demo-seed.mjs
 *
 * Safe to re-run: it clears the demo household first. Never run it against a
 * database you care about.
 */

import { createClient } from '@libsql/client';

const db = createClient({ url: process.env.DATABASE_URL || 'file:./data/chorely.db' });

const HOUSEHOLD_ID = 'hh_demo';
const JOIN_CODE = 'demohousecode';

const iso = (daysAgo) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
const ms = (daysAgo) => Date.now() - daysAgo * 86_400_000;

const members = [
  { id: 'mb_demo_ana', name: 'Ana', emoji: '🦊', weight: 1, order: 0 },
  { id: 'mb_demo_ben', name: 'Ben', emoji: '🐢', weight: 1, order: 1 },
  { id: 'mb_demo_cal', name: 'Cal', emoji: '🦉', weight: 0.5, order: 2 },
];

const chores = [
  { id: 'ch_demo_bins', name: 'Take out the bins', icon: '🗑️', effort: 1, rec: { kind: 'weekly', weekdays: [1] } },
  { id: 'ch_demo_dishes', name: 'Wash the dishes', icon: '🍽️', effort: 2, rec: { kind: 'everyNDays', days: 1, from: 'start' } },
  { id: 'ch_demo_bath', name: 'Clean the bathroom', icon: '🚿', effort: 4, rec: { kind: 'everyNDays', days: 7, from: 'completion' } },
  { id: 'ch_demo_vac', name: 'Vacuum the flat', icon: '🧹', effort: 3, rec: { kind: 'everyNDays', days: 7, from: 'completion' } },
  { id: 'ch_demo_shop', name: 'Food shop', icon: '🛒', effort: 3, rec: { kind: 'weekly', weekdays: [6] } },
  { id: 'ch_demo_plants', name: 'Water the plants', icon: '🪴', effort: 1, rec: { kind: 'everyNDays', days: 5, from: 'completion' } },
  { id: 'ch_demo_sheets', name: 'Change the bedsheets', icon: '🛏️', effort: 2, rec: { kind: 'everyNDays', days: 14, from: 'completion' } },
];

// A deliberately imbalanced history: Ana has been carrying the flat. That is
// the situation the app is built to make visible, so the demo should show it.
const history = [
  ['ch_demo_bath', 'mb_demo_ana', 4, 2],
  ['ch_demo_vac', 'mb_demo_ana', 3, 3],
  ['ch_demo_dishes', 'mb_demo_ana', 2, 1],
  ['ch_demo_dishes', 'mb_demo_ben', 2, 2],
  ['ch_demo_shop', 'mb_demo_ana', 3, 4],
  ['ch_demo_bins', 'mb_demo_ben', 1, 5],
  ['ch_demo_bath', 'mb_demo_ana', 4, 9],
  ['ch_demo_vac', 'mb_demo_cal', 3, 8],
  ['ch_demo_dishes', 'mb_demo_ana', 2, 6],
  ['ch_demo_shop', 'mb_demo_ana', 3, 11],
  ['ch_demo_plants', 'mb_demo_cal', 1, 7],
  ['ch_demo_sheets', 'mb_demo_ana', 2, 12],
  ['ch_demo_bins', 'mb_demo_ben', 1, 12],
  ['ch_demo_bath', 'mb_demo_ben', 4, 16],
  ['ch_demo_dishes', 'mb_demo_ana', 2, 14],
];

await db.execute({ sql: 'DELETE FROM households WHERE id = ?', args: [HOUSEHOLD_ID] });

await db.execute({
  sql: 'INSERT INTO households (id, name, join_code, timezone, fairness_window_days, created_at) VALUES (?,?,?,?,?,?)',
  args: [HOUSEHOLD_ID, 'Flat 3B', JOIN_CODE, 'UTC', 28, ms(30)],
});

for (const m of members) {
  await db.execute({
    sql: 'INSERT INTO members (id, household_id, name, emoji, weight, sort_order, created_at) VALUES (?,?,?,?,?,?,?)',
    args: [m.id, HOUSEHOLD_ID, m.name, m.emoji, m.weight, m.order, ms(30)],
  });
}

for (const c of chores) {
  await db.execute({
    sql: 'INSERT INTO chores (id, household_id, name, icon, effort, recurrence, rotation_mode, start_on, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    args: [c.id, HOUSEHOLD_ID, c.name, c.icon, c.effort, JSON.stringify(c.rec), 'fair', iso(30), ms(30)],
  });
}

let n = 0;
for (const [choreId, memberId, effort, daysAgo] of history) {
  await db.execute({
    sql: `INSERT INTO occurrences
            (id, household_id, chore_id, due_on, assignee_id, status,
             completed_by_id, completed_at, resolved_on, effort_awarded, created_at)
          VALUES (?,?,?,?,?,'done',?,?,?,?,?)`,
    args: [
      `oc_demo_${n++}`, HOUSEHOLD_ID, choreId, iso(daysAgo), memberId,
      memberId, ms(daysAgo), iso(daysAgo), effort, ms(daysAgo + 1),
    ],
  });
}

// Open occurrences are left for the app to schedule on first page load, which
// also exercises that path rather than faking around it.
console.log(`Seeded "Flat 3B": ${members.length} people, ${chores.length} chores, ${history.length} completions.`);
console.log(`Invite link path: /join/${JOIN_CODE}`);
