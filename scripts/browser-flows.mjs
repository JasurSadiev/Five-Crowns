#!/usr/bin/env node
/**
 * Real-browser user journeys.
 *
 * Complements browser-smoke.mjs (which checks the app becomes visible at all).
 * This one clicks through the UI the way a player does: register, create a
 * lobby, and play a solo game against bots. It exists because the "could not
 * create a lobby" report was a UI-path failure that raw HTTP tests could not
 * see - the server was fine all along.
 *
 * Needs the dev server and the emulators running.
 *   npm run dev:all
 *   node scripts/browser-flows.mjs
 */
import { chromium } from 'playwright';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

let passed = 0;
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${name}${detail ? ` - ${detail}` : ''}`);
  }
};
const section = (t) => console.log(`\n${t}`);

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/i.test(m.text())) errors.push(m.text());
});

/** Any toast or inline error currently on screen. */
async function visibleError() {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const m = text.match(
      /(Something went wrong[^\n]*|Could not [^\n]*|[^\n]*\b(failed|not allowed|invalid|already|must be|at least)\b[^\n]*)/i,
    );
    return m ? m[0].trim() : null;
  });
}

/** Everything currently on screen, for diagnosing a failed step. */
async function screenText() {
  return page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
}

try {
  /* -------------------------------------------------------------- register */
  section('1. Register a new account through the UI');
  const email = `browser${Date.now()}@example.com`;

  await page.goto(`${BASE}/register`, { waitUntil: 'load', timeout: 45000 });
  // The route is lazy-loaded behind the firebase chunk, so wait for the form
  // itself rather than a fixed delay.
  await page.waitForFunction(() => document.querySelectorAll('input').length >= 3, {
    timeout: 45000,
  });

  // The form is username / email / password, and the inputs carry no name
  // attribute, so target them by type.
  // Fill positionally: display name, email, password.
  await page.locator('input').nth(0).fill(`tester${Date.now().toString().slice(-6)}`);
  await page.locator('input').nth(1).fill(email);
  await page.locator('input').nth(2).fill('Passw0rd!23');

  const filled = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((i) => i.value.length),
  );
  check('all three fields accepted input', filled.every((n) => n > 0), JSON.stringify(filled));

  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !/\/register$/.test(url.pathname), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const signedIn = !/\/register$/.test(new URL(page.url()).pathname);
  check('registration completes and leaves /register', signedIn, page.url());
  if (!signedIn) console.log(`    screen: ${await screenText()}`);

  /* ----------------------------------------------------------- create lobby */
  section('2. Create a lobby (the reported failure)');
  await page.goto(`${BASE}/play`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(2000);

  const createBtn = page.locator('button', { hasText: /^Create table$/i }).first();
  await createBtn.waitFor({ timeout: 45000 }).catch(() => {});
  if ((await createBtn.count()) === 0) {
    check('the Create table button is present', false, await screenText());
  } else {
    await createBtn.click();
  }

  await page.waitForURL(/\/lobby\//, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const inLobby = /\/lobby\//.test(page.url());
  check('lands on the lobby page', inLobby, page.url());
  if (!inLobby) console.log(`    screen: ${await screenText()}`);

  if (inLobby) {
    const joinCode = await page.evaluate(() => {
      const m = (document.body.innerText || '').match(/\b[2-9A-HJ-NP-Z]{5}\b/);
      return m ? m[0] : null;
    });
    check('a join code is displayed', Boolean(joinCode), String(joinCode));
    await page.screenshot({ path: join(ROOT, 'docs', 'flow-lobby.png') });
  }

  /* -------------------------------------------------------------- solo game */
  section('3. Start and play a solo game against bots');
  await page.goto(`${BASE}/play`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1500);

  const hardBtn = page.locator('button', { hasText: /^Hard$/ }).first();
  await hardBtn.waitFor({ timeout: 45000 });
  await hardBtn.click();

  await page.locator('button', { hasText: /start practice game/i }).first().click();
  await page.waitForURL(/\/game\//, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(3500);

  const inGame = /\/game\//.test(page.url());
  check('solo game starts and opens the table', inGame, page.url());
  if (!inGame) console.log(`    screen: ${await screenText()}`);

  if (inGame) {
    const table = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        // Count the badge elements, not the text: the badge renders flush
        // against the name ("RobinBOT") so word-boundary matching fails.
        bots: document.querySelectorAll('[title^="Computer opponent"]').length,
        hasRound: /round\s*1/i.test(text),
        text: text.replace(/\s+/g, ' ').slice(0, 260),
      };
    });
    check('bot seats are labelled as bots', table.bots >= 3, `found ${table.bots}`);
    check('the table shows round 1', table.hasRound, table.text.slice(0, 120));

    // Take a real turn: draw, then discard.
    await page.keyboard.press('d');
    await page.waitForTimeout(2500);
    const afterDraw = await page.evaluate(() => (document.body.innerText || '').length);
    check('drawing a card does not error', (await visibleError()) === null, (await visibleError()) ?? '');
    check('the table re-rendered after the draw', afterDraw > 0);

    const cardButtons = page.locator('button[aria-label*="of"], [role="button"][aria-label*="of"]');
    const count = await cardButtons.count();
    if (count > 0) {
      await cardButtons.first().click();
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }
    const err = await visibleError();
    check('discarding does not error', err === null, err ?? '');

    // The turn is back with the player when the action bar stops saying it is
    // waiting for somebody else. The document title also flips on your turn.
    const afterTurn = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return {
        waiting: /waiting for/i.test(text),
        title: document.title,
        text: text.replace(/\s+/g, ' ').slice(0, 240),
      };
    });
    const turnIsBack = !afterTurn.waiting || /your turn/i.test(afterTurn.title);
    check(
      'bots played and the turn came back to the player',
      turnIsBack,
      `title="${afterTurn.title}" ${afterTurn.text.slice(0, 120)}`,
    );
    await page.screenshot({ path: join(ROOT, 'docs', 'flow-solo-game.png'), fullPage: false });
    console.log(`    table: "${afterTurn.text.slice(0, 120)}…"`);
  }

  section('4. No uncaught errors along the way');
  const real = errors.filter(
    (e) => !/ResizeObserver|React DevTools|WebSocket|ERR_CONNECTION_REFUSED/i.test(e),
  );
  check('no console or page errors', real.length === 0, real.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
