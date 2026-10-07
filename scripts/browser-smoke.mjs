#!/usr/bin/env node
/**
 * Real-browser smoke test.
 *
 * Why this exists: a full-screen boot overlay shipped to production and hid
 * the entire app behind a spinner that never stopped. Every check in place at
 * the time passed anyway - curl only looked at HTTP status codes, and the
 * jsdom component tests render into their own container, so nothing ever
 * composed the real index.html with a real mount in a real engine.
 *
 * This script drives actual Chromium and asserts what a user would see.
 *
 * Scenario A - dev server (emulators running): the app must paint real content
 *              and the boot overlay must be gone.
 * Scenario B - production build with NO Firebase config, served the way
 *              Firebase Hosting serves it (SPA rewrite): the app must show the
 *              actionable setup screen. Never an endless spinner.
 *
 * Usage: node scripts/browser-smoke.mjs [--dev-url http://127.0.0.1:5173]
 */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
import { createServer } from 'node:http';
import { readFile, rm, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const devUrlArg = process.argv.indexOf('--dev-url');
const DEV_URL = devUrlArg > -1 ? process.argv[devUrlArg + 1] : 'http://127.0.0.1:5173';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    console.log(`  \u2717 ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Reads what a human would actually perceive on the page. */
async function inspect(page) {
  return page.evaluate(() => {
    const boot = document.getElementById('boot');
    const root = document.getElementById('root');
    const bootVisible = boot ? getComputedStyle(boot).display !== 'none' : false;

    // What is painted at the centre of the viewport? If the overlay is on top
    // this is the spinner, no matter how well the app rendered underneath.
    const centre = document.elementFromPoint(
      Math.floor(window.innerWidth / 2),
      Math.floor(window.innerHeight / 2),
    );
    const overlayOnTop = Boolean(boot && centre && (centre === boot || boot.contains(centre)));

    return {
      bootPresent: Boolean(boot),
      bootVisible,
      overlayOnTop,
      rootChildren: root ? root.childElementCount : -1,
      visibleText: (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400),
    };
  });
}

/** Minimal static server that mimics Firebase Hosting's `**` -> /index.html rewrite. */
function serveDist(dir) {
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = join(dir, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || !existsSync(file)) file = join(dir, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(500).end('error');
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function run(cmd, args, opts = {}) {
  return new Promise((ok) => {
    const child = spawn(cmd, args, { cwd: ROOT, ...opts });
    let out = '';
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (out += d));
    child.on('close', (code) => ok({ code, out }));
  });
}

/*
 * Both builds run BEFORE Chromium starts. Rollup and a browser do not fit in
 * memory together on a small machine, and an OOM-killed build looks exactly
 * like a failing assertion.
 */
section('Preparing builds (before the browser starts - memory is tight)');

const unconfiguredDir = await mkdtemp(join(tmpdir(), 'fc-dist-'));
const unconfiguredBuild = await run(
  'npx',
  ['vite', 'build', '--mode', 'smoke', '--outDir', unconfiguredDir, '--emptyOutDir'],
  {
    env: {
      ...process.env,
      VITE_USE_EMULATORS: 'false',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_API_KEY: '',
      NODE_OPTIONS: '--max-old-space-size=1280',
    },
  },
);
check('production build (no Firebase config) succeeds', unconfiguredBuild.code === 0,
  unconfiguredBuild.out.slice(-400));

// Exactly what the user deployed: the bundled demo project baked into a
// production bundle. Must explain itself instead of spinning forever.
const demoDir = await mkdtemp(join(tmpdir(), 'fc-demo-'));
const demoBuild = await run(
  'npx',
  ['vite', 'build', '--mode', 'demoleak', '--outDir', demoDir, '--emptyOutDir'],
  {
    env: {
      ...process.env,
      VITE_USE_EMULATORS: 'false',
      VITE_FIREBASE_PROJECT_ID: 'demo-five-crowns',
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      NODE_OPTIONS: '--max-old-space-size=1280',
    },
  },
);
check('production build with demo values succeeds', demoBuild.code === 0, demoBuild.out.slice(-300));

const guardBuild = await run(
  'npx',
  ['vite', 'build', '--outDir', join(tmpdir(), 'fc-should-fail')],
  { env: { ...process.env, VITE_USE_EMULATORS: 'true', NODE_OPTIONS: '--max-old-space-size=1280' } },
);
await rm(join(tmpdir(), 'fc-should-fail'), { recursive: true, force: true });

let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
} catch (error) {
  console.error(
    '\nCould not launch Chromium. Install the browser and its libraries first:\n' +
      '  npx playwright install chromium\n' +
      '  sudo npx playwright install-deps chromium\n\n' +
      String(error).split('\n')[0],
  );
  process.exit(1);
}

try {
  /* ---------------------------------------------------------------- A */
  section('A. Dev server - the app must actually become visible');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

    const response = await page.goto(DEV_URL, { waitUntil: 'load', timeout: 45000 });
    check('page responds 200', response?.status() === 200, `got ${response?.status()}`);

    // Give the app the same patience a user would, but no more.
    await page
      .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, {
        timeout: 20000,
      })
      .catch(() => {});
    await page.waitForTimeout(1500);

    const state = await inspect(page);
    check('app mounted into #root', state.rootChildren > 0, `children=${state.rootChildren}`);
    check('boot overlay no longer in the DOM', !state.bootPresent);
    check('nothing is covering the centre of the screen', !state.overlayOnTop);
    check(
      'real content is painted (not just a spinner)',
      state.visibleText.length > 40 && !/^Five Crowns$/i.test(state.visibleText),
      JSON.stringify(state.visibleText.slice(0, 120)),
    );
    check(
      'landing page content present',
      /five crowns/i.test(state.visibleText),
      state.visibleText.slice(0, 120),
    );
    check(
      'no uncaught page errors',
      consoleErrors.filter((e) => e.startsWith('pageerror')).length === 0,
      consoleErrors.filter((e) => e.startsWith('pageerror'))[0] ?? '',
    );

    await page.screenshot({ path: join(ROOT, 'docs', 'smoke-dev.png') });
    console.log(`    text seen: "${state.visibleText.slice(0, 110)}…"`);
    await page.close();

    // The brief calls for an immersive dark table; confirm it actually paints.
    const darkPage = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'dark',
    });
    await darkPage.goto(DEV_URL, { waitUntil: 'load', timeout: 45000 });
    await darkPage
      .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, {
        timeout: 20000,
      })
      .catch(() => {});
    await darkPage.waitForTimeout(1200);
    const isDark = await darkPage.evaluate(
      () => document.documentElement.classList.contains('dark'),
    );
    check('dark theme applies when the OS prefers dark', isDark);
    await darkPage.screenshot({ path: join(ROOT, 'docs', 'smoke-dev-dark.png') });
    await darkPage.close();
  }

  /* ---------------------------------------------------------------- B */
  section('B. Production build with no Firebase config - must explain, not hang');
  if (unconfiguredBuild.code === 0) {
    const server = await serveDist(unconfiguredDir);
    const { port } = server.address();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 45000 });
    await page
      .waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, {
        timeout: 20000,
      })
      .catch(() => {});
    await page.waitForTimeout(2000);

    const state = await inspect(page);
    check('app mounted', state.rootChildren > 0, `children=${state.rootChildren}`);
    check('boot overlay gone', !state.bootPresent);
    check(
      'shows an actionable message instead of a spinner',
      /configured|firebase|could not reach/i.test(state.visibleText),
      state.visibleText.slice(0, 160),
    );
    check(
      'does not sit on "Checking your session"',
      !/checking your session/i.test(state.visibleText),
      state.visibleText.slice(0, 160),
    );
    console.log(`    text seen: "${state.visibleText.slice(0, 140)}…"`);

    await page.screenshot({ path: join(ROOT, 'docs', 'smoke-unconfigured.png') });
    await page.close();
    server.close();
  } else {
    console.log('  - skipped (build failed above)');
  }

  /* ---------------------------------------------------------------- C */
  section('D. The exact reported failure: demo config in a production build');
  if (demoBuild.code === 0) {
    const server = await serveDist(demoDir);
    const { port } = server.address();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(4000);

    const state = await inspect(page);
    check('boot overlay gone', !state.bootPresent);
    check('app mounted', state.rootChildren > 0, `children=${state.rootChildren}`);
    check(
      'never stuck on an infinite loading screen',
      !/checking your session|loading…/i.test(state.visibleText),
      state.visibleText.slice(0, 160),
    );
    check(
      'names the demo-config cause',
      /demo configuration/i.test(state.visibleText),
      state.visibleText.slice(0, 160),
    );
    console.log(`    text seen: "${state.visibleText.slice(0, 140)}…"`);
    await page.screenshot({ path: join(ROOT, 'docs', 'smoke-demo-config.png') });
    await page.close();
    server.close();
  } else {
    console.log('  - skipped (build failed above)');
  }

  section('C. Build guard - emulator settings must not be deployable');
  {
    check('vite build refuses VITE_USE_EMULATORS=true in production', guardBuild.code !== 0);
    check(
      'the error explains the .env.local precedence trap',
      /\.env\.local/.test(guardBuild.out) && /overrides \.env/.test(guardBuild.out),
      guardBuild.out.slice(-300),
    );
  }
} finally {
  await browser.close();
  await rm(unconfiguredDir, { recursive: true, force: true });
  await rm(demoDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed / ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
