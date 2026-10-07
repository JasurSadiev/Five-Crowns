import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
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

/**
 * Emulator mode is DEVELOPMENT ONLY by default.
 *
 * Why this guard exists: `vite build` loads `.env.local` as well as `.env`,
 * and `.env.local` wins. A leftover `VITE_USE_EMULATORS=true` therefore ships
 * to production, where `connectAuthEmulator(auth, window.location.origin)`
 * points the Auth SDK at the Hosting domain. Hosting rewrites every unknown
 * path to `/index.html`, so the SDK receives HTML instead of JSON, never
 * resolves, and the app hangs on its loading screen forever.
 *
 * Set VITE_FORCE_EMULATORS=true if you genuinely need an emulator-backed
 * production build (CI end-to-end runs against a preview channel, say).
 */
const emulatorsRequested = import.meta.env.VITE_USE_EMULATORS === 'true';
const emulatorsForced = import.meta.env.VITE_FORCE_EMULATORS === 'true';

export const USE_EMULATORS = emulatorsRequested && (import.meta.env.DEV || emulatorsForced);

/** True when a production bundle asked for emulators and we refused. */
export const EMULATORS_SUPPRESSED = emulatorsRequested && !USE_EMULATORS;

if (EMULATORS_SUPPRESSED) {
  console.error(
    '[firebase] This build was created with VITE_USE_EMULATORS=true but is running in ' +
      'production. Emulator mode has been ignored so the app does not hang. Rebuild with ' +
      'your real VITE_FIREBASE_* values (remember that .env.local overrides .env).',
  );
}

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

/** Placeholder values from the bundled emulator profile - never valid in production. */
const DEMO_VALUES = ['demo-five-crowns', 'demo-api-key', 'fake-api-key'];

export const isConfigured = Boolean(options.projectId && options.apiKey);

/** A production bundle built against the local demo profile cannot work. */
export const isDemoConfig =
  !import.meta.env.DEV &&
  DEMO_VALUES.some((value) => options.projectId === value || options.apiKey === value);

if (!isConfigured) {
  // Fail loudly in the console but let the UI render a helpful setup screen.
  console.error(
    '[firebase] Missing configuration. Copy .env.example to .env and fill in your Firebase web app values.',
  );
}

if (isDemoConfig) {
  console.error(
    `[firebase] This build is using the bundled demo project ("${options.projectId}"). ` +
      'It was almost certainly built with .env.development.local or .env.local in place. ' +
      'Create a .env with your real Firebase web app config and rebuild.',
  );
}

/**
 * Placeholder credentials used only when the real ones are absent.
 *
 * `initializeAuth` and `getStorage` THROW when the apiKey or storageBucket is
 * empty. Because this module is imported at the top of the dependency graph, a
 * throw here kills the whole bundle before React mounts - the user gets a
 * blank page (or a stuck pre-paint spinner) and the "please configure me"
 * screen below can never render. Substituting syntactically valid placeholders
 * keeps construction side-effect-free and lets the UI explain the problem.
 * No network call is ever made with these: StartupGate blocks the app first.
 */
const PLACEHOLDER: FirebaseOptions = {
  apiKey: 'missing-configuration',
  authDomain: 'missing-configuration.firebaseapp.com',
  projectId: 'missing-configuration',
  storageBucket: 'missing-configuration.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:missing',
};

const effectiveOptions: FirebaseOptions = isConfigured ? options : PLACEHOLDER;

/** Records an SDK construction failure so the UI can report it. */
let bootstrapFailure: string | null = null;

export const app: FirebaseApp = initializeApp(effectiveOptions);

/* ----------------------------- Authentication ---------------------------- */

function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      // Sessions survive reloads and browser restarts.
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (error) {
    // Private browsing modes and locked-down browsers can refuse IndexedDB.
    console.warn('[firebase] falling back to default auth persistence', error);
    try {
      return getAuth(app);
    } catch (fatal) {
      console.error('[firebase] auth could not be initialised', fatal);
      bootstrapFailure = 'auth';
      // Never throw from module scope - see PLACEHOLDER above.
      return getAuth(initializeApp(PLACEHOLDER, 'fallback'));
    }
  }
}

export const auth: Auth = createAuth();

if (USE_EMULATORS) {
  connectAuthEmulator(auth, window.location.origin, { disableWarnings: true });
}

/* -------------------------------- Firestore ------------------------------- */

function createDb(): Firestore {
  const emulatorSettings = USE_EMULATORS
    ? {
        host: window.location.host,
        ssl: window.location.protocol === 'https:',
        // WebChannel streaming does not survive every dev proxy; long polling does.
        experimentalForceLongPolling: true,
      }
    : {};
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      // Offline cache keeps the last known state visible while reconnecting.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ...emulatorSettings,
    });
  } catch (error) {
    // Persistent cache needs IndexedDB; degrade to memory rather than die.
    console.warn('[firebase] persistent cache unavailable, using memory cache', error);
    return initializeFirestore(app, { ignoreUndefinedProperties: true, ...emulatorSettings });
  }
}

export const db: Firestore = createDb();

/* --------------------------------- Storage -------------------------------- */

export const storage: FirebaseStorage = getStorage(
  app,
  // getStorage throws outright when no bucket is configured.
  options.storageBucket ? undefined : `gs://${PLACEHOLDER.storageBucket}`,
);
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

/* ------------------------------ Health report ----------------------------- */

/**
 * Why the app cannot talk to Firebase, if it cannot. `null` means healthy.
 * Read by StartupGate in App.tsx to show an actionable screen instead of an
 * endless loading spinner.
 */
export const configProblem: string | null = !isConfigured
  ? 'missing'
  : isDemoConfig
    ? 'demo'
    : EMULATORS_SUPPRESSED
      ? 'emulator'
      : bootstrapFailure;
