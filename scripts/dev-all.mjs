#!/usr/bin/env node
/**
 * One command to run the whole stack locally:
 *
 *   1. builds the Cloud Functions (which also syncs the shared rules engine),
 *   2. starts the Firebase Emulator Suite,
 *   3. waits until Auth / Firestore / Functions are actually listening,
 *   4. starts Vite.
 *
 * Everything is torn down together on Ctrl-C.
 *
 * Flags:
 *   --skip-build     don't rebuild functions first
 *   --no-ui          disable the emulator UI (it is off by default in firebase.json)
 *   --low-memory     cap the JVM/Node heaps and run functions in a single runtime,
 *                    which is required on machines with ~2 GB of RAM
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = new Set(process.argv.slice(2));

const PROJECT = process.env.FIREBASE_PROJECT || 'demo-five-crowns';
const PORTS = {
  auth: Number(process.env.EMULATOR_AUTH_PORT || 9099),
  firestore: Number(process.env.EMULATOR_FIRESTORE_PORT || 8080),
  functions: Number(process.env.EMULATOR_FUNCTIONS_PORT || 5001),
};

const children = [];
let shuttingDown = false;

function log(scope, message) {
  const stamp = new Date().toLocaleTimeString();
  process.stdout.write(`\x1b[2m${stamp}\x1b[0m \x1b[36m[${scope}]\x1b[0m ${message}\n`);
}

function run(scope, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  children.push(child);

  const pipe = (stream, isError) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const colour = isError ? '\x1b[33m' : '';
        process.stdout.write(`\x1b[2m[${scope}]\x1b[0m ${colour}${line}\x1b[0m\n`);
      }
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (code !== 0) {
      log(scope, `exited with code ${code}`);
      shutdown(code ?? 1);
    }
  });
  return child;
}

function waitForPort(port, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }
        setTimeout(attempt, 600);
      });
    };
    attempt();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('dev', 'shutting down…');
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) child.kill('SIGKILL');
    }
    process.exit(code);
  }, 2500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  if (!argv.has('--skip-build')) {
    log('functions', 'building (this also syncs the shared rules engine)…');
    await new Promise((resolve, reject) => {
      const build = spawn('npm', ['--prefix', 'functions', 'run', 'build'], {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      build.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`functions build failed (${code})`)),
      );
    });
  }

  const lowMemory = argv.has('--low-memory');
  const emulatorArgs = [
    'firebase',
    'emulators:start',
    '--only',
    'auth,firestore,functions',
    '--project',
    PROJECT,
  ];
  if (lowMemory) emulatorArgs.push('--inspect-functions', '9229');

  log('emulators', `starting for project ${PROJECT}${lowMemory ? ' (low-memory mode)' : ''}…`);
  run('emulators', 'npx', emulatorArgs, {
    env: {
      ...process.env,
      ...(lowMemory
        ? {
            JAVA_TOOL_OPTIONS: '-Xmx224m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC',
            NODE_OPTIONS: '--max-old-space-size=256',
          }
        : {}),
    },
  });

  await Promise.all([
    waitForPort(PORTS.auth),
    waitForPort(PORTS.firestore),
    waitForPort(PORTS.functions),
  ]);
  log('emulators', 'auth, firestore and functions are listening');

  log('vite', 'starting the web app…');
  run('vite', 'npx', ['vite', '--host', '0.0.0.0']);

  log('dev', 'everything is up. Press Ctrl-C to stop.');
}

main().catch((error) => {
  log('dev', `failed: ${error.message}`);
  shutdown(1);
});
