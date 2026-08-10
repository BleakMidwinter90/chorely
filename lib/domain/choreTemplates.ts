/**
 * A library of chores people actually have.
 *
 * Setting up a chore app is the moment most households abandon one: the empty
 * screen asks you to do the hardest part — think of everything — before the app
 * has earned any trust at all. Picking from a list is a different task
 * entirely, and a much easier one.
 *
 * Effort values and cadences are opinionated on purpose. A default that is
 * roughly right is far more useful than a blank field, and every one of them
 * can be changed after the fact.
 */

import type { Recurrence } from './types';

export interface ChoreTemplate {
  name: string;
  icon: string;
  effort: number;
  recurrence: Recurrence;
  /** Practical knowledge worth carrying over as the chore's note. */
  note?: string;
}

export interface TemplateGroup {
  room: string;
  chores: ChoreTemplate[];
}

const flexible = (days: number): Recurrence => ({ kind: 'everyNDays', days, from: 'completion' });
const fixed = (days: number): Recurrence => ({ kind: 'everyNDays', days, from: 'start' });
const weekly = (weekdays: Recurrence extends { kind: 'weekly'; weekdays: infer W } ? W : never) =>
  ({ kind: 'weekly', weekdays }) as Recurrence;

export const CHORE_TEMPLATES: TemplateGroup[] = [
  {
    room: 'Kitchen',
    chores: [
      { name: 'Wash the dishes', icon: '🍽️', effort: 2, recurrence: fixed(1) },
      { name: 'Wipe the counters', icon: '🧽', effort: 1, recurrence: flexible(2) },
      { name: 'Empty the dishwasher', icon: '🍴', effort: 1, recurrence: fixed(1) },
      { name: 'Clean the hob', icon: '🔥', effort: 2, recurrence: flexible(7) },
      { name: 'Clean out the fridge', icon: '🧊', effort: 3, recurrence: flexible(14) },
      { name: 'Mop the kitchen floor', icon: '🧹', effort: 3, recurrence: flexible(7) },
      { name: 'Clean the oven', icon: '🔥', effort: 5, recurrence: flexible(60) },
    ],
  },
  {
    room: 'Bathroom',
    chores: [
      { name: 'Clean the toilet', icon: '🚽', effort: 3, recurrence: flexible(7) },
      { name: 'Clean the shower', icon: '🚿', effort: 4, recurrence: flexible(7) },
      { name: 'Clean the sink and mirror', icon: '🪞', effort: 2, recurrence: flexible(7) },
      { name: 'Replace the towels', icon: '🧴', effort: 1, recurrence: flexible(7) },
    ],
  },
  {
    room: 'Living space',
    chores: [
      { name: 'Vacuum', icon: '🧹', effort: 3, recurrence: flexible(7) },
      { name: 'Dust the surfaces', icon: '🪶', effort: 2, recurrence: flexible(14) },
      { name: 'Tidy the shared spaces', icon: '📦', effort: 2, recurrence: fixed(3) },
      { name: 'Clean the windows', icon: '🪟', effort: 3, recurrence: flexible(60) },
    ],
  },
  {
    room: 'Bedroom & laundry',
    chores: [
      { name: 'Change the bedsheets', icon: '🛏️', effort: 2, recurrence: flexible(14) },
      { name: 'Do a load of washing', icon: '🧺', effort: 2, recurrence: flexible(4) },
      { name: 'Put the washing away', icon: '👕', effort: 2, recurrence: flexible(4) },
    ],
  },
  {
    room: 'Household',
    chores: [
      {
        name: 'Take out the bins',
        icon: '🗑️',
        effort: 1,
        recurrence: weekly([1] as never),
        note: 'Collection day — check which bin it is this week',
      },
      { name: 'Take out the recycling', icon: '♻️', effort: 1, recurrence: weekly([2] as never) },
      { name: 'Food shop', icon: '🛒', effort: 3, recurrence: weekly([6] as never) },
      { name: 'Water the plants', icon: '🪴', effort: 1, recurrence: flexible(5) },
      { name: 'Sort the post', icon: '📮', effort: 1, recurrence: flexible(7) },
      { name: 'Pay the shared bills', icon: '💡', effort: 2, recurrence: { kind: 'monthly', daysOfMonth: [1] } },
    ],
  },
  {
    room: 'Pets',
    chores: [
      { name: 'Walk the dog', icon: '🐕', effort: 2, recurrence: fixed(1) },
      { name: 'Feed the pets', icon: '🐈', effort: 1, recurrence: fixed(1) },
      { name: 'Clean the litter tray', icon: '🐾', effort: 2, recurrence: flexible(3) },
    ],
  },
];

/** Flat lookup, for resolving what a user ticked. */
export function findTemplate(name: string): ChoreTemplate | undefined {
  for (const group of CHORE_TEMPLATES) {
    const found = group.chores.find((chore) => chore.name === name);
    if (found) return found;
  }
  return undefined;
}
