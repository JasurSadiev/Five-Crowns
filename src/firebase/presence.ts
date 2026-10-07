import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { RTDB_ENABLED, app, db } from './config';

/**
 * Presence has two implementations and neither is ever treated as game truth.
 *
 *  1. Realtime Database (preferred in production): `onDisconnect` fires the
 *     moment the socket drops, so an abrupt tab close is detected instantly.
 *  2. Firestore heartbeat (used when no RTDB instance is configured): the tab
 *     refreshes `lastSeenAt` on a timer and a scheduled function sweeps up
 *     stale rows.
 */

export type Presence = 'online' | 'away' | 'offline';

let heartbeat: ReturnType<typeof setInterval> | null = null;
let detachRtdb: (() => void) | null = null;

async function writeFirestorePresence(uid: string, state: Presence): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      presence: state,
      isOnline: state !== 'offline',
      lastSeenAt: serverTimestamp(),
    });
  } catch {
    /* presence is advisory - never surface an error for it */
  }
}

async function startRtdb(uid: string): Promise<void> {
  const { getDatabase, ref, onDisconnect, onValue, set, serverTimestamp: rtdbNow } = await import(
    'firebase/database'
  );
  const rtdb = getDatabase(app);
  const statusRef = ref(rtdb, `status/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');

  const stop = onValue(connectedRef, async (snapshot) => {
    if (snapshot.val() === false) return;
    await onDisconnect(statusRef).set({ state: 'offline', lastChanged: rtdbNow() });
    await set(statusRef, { state: 'online', lastChanged: rtdbNow() });
    await writeFirestorePresence(uid, 'online');
  });
  detachRtdb = () => {
    stop();
    void set(statusRef, { state: 'offline', lastChanged: rtdbNow() });
  };
}

/** Begins publishing presence for the signed-in player. Returns a stop fn. */
export function startPresence(uid: string): () => void {
  stopPresence();

  const push = (state: Presence) => void writeFirestorePresence(uid, state);
  push('online');

  if (RTDB_ENABLED) {
    void startRtdb(uid);
  } else {
    heartbeat = setInterval(() => {
      push(document.visibilityState === 'visible' ? 'online' : 'away');
    }, 60_000);
  }

  const onVisibility = () => push(document.visibilityState === 'visible' ? 'online' : 'away');
  const onLeave = () => push('offline');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onLeave);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onLeave);
    push('offline');
    stopPresence();
  };
}

export function stopPresence(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (detachRtdb) detachRtdb();
  detachRtdb = null;
}
