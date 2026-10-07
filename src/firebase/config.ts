import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  initializeAuth,
  browserPopupRedirectResolver,
  indexedDBLocalPersistence,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

/**
 * Firebase bootstrap.
 *
 * Two modes:
 *  - production: the real project, driven entirely by VITE_FIREBASE_* env vars.
 *  - emulators (VITE_USE_EMULATORS=true): every Firebase endpoint is reached
 *    through the Vite dev server, which proxies it to the local emulator. That
 *    keeps requests same-origin, so the app works over HTTPS, inside an iframe
 *    and from another device on the network without mixed-content errors.
 */

export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1';

const options: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const isConfigured = Boolean(options.projectId && options.apiKey);

if (!isConfigured) {
  // Fail loudly in the console but let the UI render a helpful setup screen.
  console.error(
    '[firebase] Missing configuration. Copy .env.example to .env and fill in your Firebase web app values.',
  );
}

export const app: FirebaseApp = initializeApp(options);

/* ----------------------------- Authentication ---------------------------- */

export const auth: Auth = initializeAuth(app, {
  // Sessions survive reloads and browser restarts.
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

if (USE_EMULATORS) {
  connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
}

/* -------------------------------- Firestore ------------------------------- */

export const db: Firestore = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // Offline cache keeps the last known state visible while reconnecting.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ...(USE_EMULATORS
    ? {
        host: window.location.host,
        ssl: window.location.protocol === 'https:',
        // WebChannel streaming does not survive every dev proxy; long polling does.
        experimentalForceLongPolling: true,
      }
    : {}),
});

/* --------------------------------- Storage -------------------------------- */

export const storage: FirebaseStorage = getStorage(app);
if (USE_EMULATORS) {
  try {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  } catch {
    /* storage emulator is optional */
  }
}

/* -------------------------------- App Check ------------------------------- */

const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (import.meta.env.VITE_APPCHECK_DEBUG === 'true') {
  // Prints a debug token to the console; register it in the Firebase console.
  (window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    true;
}

if (recaptchaKey && !USE_EMULATORS) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('[firebase] App Check could not start', error);
  }
}

/* -------------------------------- Analytics ------------------------------- */

export async function initAnalytics(): Promise<void> {
  if (USE_EMULATORS || !options.measurementId) return;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) getAnalytics(app);
  } catch {
    /* analytics is entirely optional */
  }
}

/** Realtime Database is only used for presence, and only when configured. */
export const RTDB_ENABLED = Boolean(options.databaseURL) && !USE_EMULATORS;
