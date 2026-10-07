import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Separate config for the DOM smoke tests. The engine suite deliberately runs
 * in a plain node environment (it must stay framework-free), so the UI tests
 * get their own jsdom config rather than slowing that suite down.
 */
export default defineConfig({
  plugins: [react()],
  // Force the browser build of the Firebase SDK. Vitest always carries the
  // Node export condition, which resolves firebase/auth to a build whose
  // persistence classes are stubs, so initializeAuth() throws. Aliasing to the
  // ESM browser entry points makes the test environment match the real app.
  resolve: {
    alias: [
      {
        find: /^firebase\/auth$/,
        replacement: path.resolve(__dirname, 'node_modules/firebase/auth/dist/esm/index.esm.js'),
      },
      {
        find: /^@firebase\/auth$/,
        replacement: path.resolve(
          __dirname,
          'node_modules/firebase/node_modules/@firebase/auth/dist/esm2017/index.js',
        ),
      },
    ],
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    server: { deps: { inline: [/firebase/, /@firebase/] } },
    include: ['src/__tests__/**/*.test.tsx'],
    globals: true,
    setupFiles: ['src/__tests__/setup.ts'],
  },
  define: {
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('fake-api-key'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('demo-five-crowns'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('demo-five-crowns.firebaseapp.com'),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('1:1:web:1'),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify('1'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify('demo-five-crowns.appspot.com'),
    'import.meta.env.VITE_USE_EMULATORS': JSON.stringify('false'),
  },
});
