/**
 * Renders the app to PNGs for the README.
 *
 *   node scripts/demo-seed.mjs        # something to look at
 *   npm run build && npm start        # in another shell
 *   node scripts/screenshots.mjs
 *
 * Not part of CI. Playwright is a heavy development-only dependency and a
 * screenshot job that fails on a machine without a browser would be a
 * permanently red build for no benefit.
 */

import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'docs/screenshots';

// A phone, because that is where this app is actually used.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const SHOTS = [
  { name: 'landing', path: '/', viewport: DESKTOP, session: false, fullPage: true },
  { name: 'today', path: '/home', viewport: PHONE },
  { name: 'balance', path: '/home/balance', viewport: PHONE, fullPage: true },
  { name: 'shopping', path: '/home/shopping', viewport: PHONE },
  { name: 'money', path: '/home/money', viewport: PHONE },
  { name: 'chores', path: '/home/chores', viewport: PHONE },
];

/** A session for the seeded demo household, so the signed-in pages render. */
async function demoSessionToken() {
  const db = createClient({ url: process.env.DATABASE_URL ?? 'file:./data/chorely.db' });
  const token = 'screenshot-session-token';
  const hash = createHash('sha256').update(token).digest('hex');

  const [member] = (
    await db.execute("SELECT id FROM members WHERE household_id = 'hh_demo' ORDER BY sort_order")
  ).rows;
  if (!member) throw new Error('Run scripts/demo-seed.mjs first.');

  await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hash] });
  await db.execute({
    sql: 'INSERT INTO sessions (token_hash, member_id, household_id, created_at, last_seen_at) VALUES (?,?,?,?,?)',
    args: [hash, member.id, 'hh_demo', Date.now(), Date.now()],
  });

  return token;
}

const token = await demoSessionToken();
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 2,
    colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light',
  });

  if (shot.session !== false) {
    await context.addCookies([
      {
        name: 'chorely_session',
        value: token,
        url: BASE,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }

  const page = await context.newPage();
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
  // Web fonts settle a beat after the network does; without this the display
  // serif is caught mid-swap and every screenshot shows the fallback.
  await page.waitForTimeout(600);

  const suffix = process.env.THEME === 'dark' ? '-dark' : '';
  await page.screenshot({
    path: `${OUT}/${shot.name}${suffix}.png`,
    fullPage: Boolean(shot.fullPage),
  });
  console.log(`${OUT}/${shot.name}${suffix}.png`);

  await context.close();
}

await browser.close();
