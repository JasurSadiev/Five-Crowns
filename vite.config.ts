import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * When the Firebase Emulator Suite is used the browser is often not on the same
 * host as the emulators (containers, Codespaces, cloud dev previews). Proxying
 * the emulator endpoints through Vite keeps everything same-origin, which also
 * means the app works over HTTPS without mixed-content errors.
 */
function emulatorProxy(env: Record<string, string>): Record<string, string | ProxyOptions> {
  if (env.VITE_USE_EMULATORS !== 'true') return {};
  const host = env.EMULATOR_HOST || '127.0.0.1';
  const auth = `http://${host}:${env.EMULATOR_AUTH_PORT || '9099'}`;
  const firestore = `http://${host}:${env.EMULATOR_FIRESTORE_PORT || '8080'}`;
  const functions = `http://${host}:${env.EMULATOR_FUNCTIONS_PORT || '5001'}`;
  const database = `http://${host}:${env.EMULATOR_DATABASE_PORT || '9000'}`;
  const storage = `http://${host}:${env.EMULATOR_STORAGE_PORT || '9199'}`;
  const common = { changeOrigin: true, secure: false } as const;
  return {
    '/identitytoolkit.googleapis.com': { target: auth, ...common },
    '/securetoken.googleapis.com': { target: auth, ...common },
    '/emulator': { target: auth, ...common },
    '/google.firestore.v1.Firestore': { target: firestore, ...common },
    '/v1/projects': { target: firestore, ...common },
    '/__fn': {
      target: functions,
      ...common,
      rewrite: (p: string) => p.replace(/^\/__fn/, ''),
    },
    '/.ws': { target: database, ws: true, ...common },
    '/.lp': { target: database, ...common },
    '/__storage': {
      target: storage,
      ...common,
      rewrite: (p: string) => p.replace(/^\/__storage/, ''),
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  /*
   * Refuse to produce a deployable bundle that points at the emulators.
   *
   * Vite loads `.env.local` for `vite build` too, and it outranks `.env`, so a
   * leftover development profile silently ships to production. The result is a
   * site that hangs on its loading screen forever, which is very hard to debug
   * from the outside. Fail the build instead.
   */
  if (command === 'build' && mode === 'production' && env.VITE_USE_EMULATORS === 'true') {
    if (env.VITE_FORCE_EMULATORS !== 'true') {
      throw new Error(
        [
          '',
          'Refusing to build: VITE_USE_EMULATORS=true in a production build.',
          '',
          'This would deploy a site that tries to reach the Firebase emulators and',
          'hangs on the loading screen forever.',
          '',
          'Remember Vite loads .env.local in EVERY mode and it overrides .env.',
          'Keep emulator settings in .env.development.local instead, and put your',
          'real Firebase values in .env or .env.production.',
          '',
          'Set VITE_FORCE_EMULATORS=true only if this is genuinely intentional.',
          '',
        ].join('\n'),
      );
    }
  }

  if (command === 'build' && mode === 'production' && !env.VITE_FIREBASE_PROJECT_ID) {
    console.warn(
      '\n[build] WARNING: VITE_FIREBASE_PROJECT_ID is empty. The deployed app will not ' +
        'be able to reach Firebase. Copy .env.example to .env and fill it in.\n',
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.PORT || 5173),
      strictPort: false,
      // Required so cloud dev previews (*.e2b.app, Codespaces, ngrok...) are accepted.
      allowedHosts: true,
      proxy: emulatorProxy(env),
      hmr: { clientPort: Number(env.HMR_CLIENT_PORT || 443) },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
            motion: ['framer-motion'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      globals: true,
    },
  };
});
