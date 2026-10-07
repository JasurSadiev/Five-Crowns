#!/usr/bin/env node
/**
 * Copies the canonical rules engine into the Cloud Functions source tree.
 *
 * The browser and the server MUST run byte-identical rules; rather than
 * publishing a private npm package we simply vendor the engine at build time.
 * `functions/src/shared` is generated - never edit it by hand.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'functions/src/shared');

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

await cp(resolve(root, 'src/game'), resolve(target, 'game'), {
  recursive: true,
  filter: (src) => !src.includes('__tests__'),
});
await cp(resolve(root, 'src/types'), resolve(target, 'types'), { recursive: true });

await writeFile(
  resolve(target, 'README.md'),
  '# Generated code\n\nThis directory is produced by `scripts/sync-engine.mjs` from `src/game` and\n`src/types`. Do not edit it by hand - run `npm run sync:engine` instead.\n',
);

console.log('[sync-engine] copied src/game + src/types -> functions/src/shared');
