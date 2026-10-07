#!/usr/bin/env node
/**
 * Pre-deploy bundle check.
 *
 * The site once went live with the local emulator profile baked in, because
 * `vite build` loads `.env.local` too and it outranks `.env`. Nothing inspected
 * the output, so the first sign of trouble was a loading screen that never
 * ended. This script reads the built bundle and refuses obviously broken
 * deploys. It runs automatically before `npm run deploy*`.
 *
 * Usage: node scripts/verify-build.mjs [dist]
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));

const problems = [];
const warnings = [];

if (!existsSync(DIST)) {
  console.error(`No build found at ${DIST}. Run "npm run build" first.`);
  process.exit(1);
}

/* ------------------------------- index.html ------------------------------ */

const html = await readFile(join(DIST, 'index.html'), 'utf8');

if (html.includes('id="boot"') && !html.includes('#root:not(:empty) + #boot')) {
  problems.push(
    'index.html renders the #boot overlay but is missing the CSS rule that hides it\n' +
      '    ("#root:not(:empty) + #boot { display: none !important; }").\n' +
      '    Without it the overlay covers the app forever if JavaScript fails.',
  );
}

if (!/<script[^>]+type="module"/.test(html)) {
  problems.push('index.html does not load a module script - the app can never start.');
}

/* --------------------------------- assets -------------------------------- */

const assetDir = join(DIST, 'assets');
const files = existsSync(assetDir) ? await readdir(assetDir) : [];
const jsFiles = files.filter((f) => f.endsWith('.js'));

if (jsFiles.length === 0) problems.push('No JavaScript emitted into dist/assets.');

let configSeen = false;

for (const file of jsFiles) {
  const code = await readFile(join(assetDir, file), 'utf8');

  // The Firebase options object survives minification as a key cluster.
  const match = code.match(/\{apiKey:("(?:[^"\\]|\\.)*"|void 0)[\s\S]{0,400}?projectId:("(?:[^"\\]|\\.)*"|void 0)/);
  if (!match) continue;
  configSeen = true;

  const apiKey = match[1] === 'void 0' ? null : JSON.parse(match[1]);
  const projectId = match[2] === 'void 0' ? null : JSON.parse(match[2]);

  if (!apiKey || !projectId) {
    warnings.push(
      'The bundle contains no Firebase credentials, so the deployed site will show the\n' +
        '    "not configured" screen. Create a .env with your real VITE_FIREBASE_* values\n' +
        '    and rebuild before deploying to users.',
    );
  }

  for (const [label, value] of [
    ['apiKey', apiKey],
    ['projectId', projectId],
  ]) {
    if (value && /^(demo-|fake-|missing-configuration)/.test(value)) {
      problems.push(
        `The bundle was built with the demo/placeholder ${label} "${value}".\n` +
          '    Remove .env.local / .env.development.local from the build machine, put your\n' +
          '    real values in .env, and rebuild.',
      );
    }
  }

  // Emulator endpoints must never appear in a deployable bundle.
  if (/connectAuthEmulator\s*\(/.test(code) && /USE_EMULATORS\s*=\s*!0/.test(code)) {
    problems.push('Emulator mode is enabled in this bundle. It cannot work once deployed.');
  }
  if (/127\.0\.0\.1:(8080|9099|5001|9199)/.test(code)) {
    problems.push('The bundle hardcodes a localhost emulator address.');
  }
}

if (!configSeen && jsFiles.length > 0) {
  warnings.push('Could not locate the Firebase config object in the bundle to inspect it.');
}

/* --------------------------------- report -------------------------------- */

for (const warning of warnings) console.log(`\u26a0  ${warning}`);

if (problems.length > 0) {
  console.error('\nBuild verification FAILED:\n');
  for (const problem of problems) console.error(`  \u2717 ${problem}\n`);
  console.error('Refusing to deploy a build that cannot work.\n');
  process.exit(1);
}

console.log(`\u2713 Build verified (${jsFiles.length} chunks, no emulator or demo config).`);
