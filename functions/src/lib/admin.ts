import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { setGlobalOptions } from 'firebase-functions/v2';

if (getApps().length === 0) {
  initializeApp();
}

export const REGION = process.env.FUNCTIONS_REGION || 'us-central1';

setGlobalOptions({
  region: REGION,
  maxInstances: 20,
  memory: '512MiB',
  timeoutSeconds: 60,
});

export const db = getFirestore();
// Optional meld fields (`rank`, `suit`, `startRank`) are absent rather than
// null for some melds; this keeps Firestore from rejecting the write.
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export { FieldValue, Timestamp, getDatabase };

/** App Check is enforced in production; disable it for local emulator work. */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

export const col = {
  users: () => db.collection('users'),
  user: (uid: string) => db.collection('users').doc(uid),
  userPrivate: (uid: string) => db.collection('users').doc(uid).collection('private').doc('profile'),
  usernames: () => db.collection('usernames'),
  username: (nameLower: string) => db.collection('usernames').doc(nameLower),
  friends: () => db.collection('friends'),
  friendship: (pairKey: string) => db.collection('friends').doc(pairKey),
  invitations: () => db.collection('gameInvitations'),
  invitation: (id: string) => db.collection('gameInvitations').doc(id),
  notifications: () => db.collection('notifications'),
  lobbies: () => db.collection('lobbies'),
  lobby: (id: string) => db.collection('lobbies').doc(id),
  lobbyCodes: () => db.collection('lobbyCodes'),
  lobbyCode: (code: string) => db.collection('lobbyCodes').doc(code),
  games: () => db.collection('games'),
  game: (id: string) => db.collection('games').doc(id),
  gamePlayers: (id: string) => db.collection('games').doc(id).collection('players'),
  gamePlayer: (id: string, uid: string) =>
    db.collection('games').doc(id).collection('players').doc(uid),
  gameHand: (id: string, uid: string) =>
    db.collection('games').doc(id).collection('hands').doc(uid),
  gameSecret: (id: string) => db.collection('games').doc(id).collection('secret').doc('state'),
  gameRounds: (id: string) => db.collection('games').doc(id).collection('rounds'),
  gameEvents: (id: string) => db.collection('games').doc(id).collection('events'),
  gameChat: (id: string) => db.collection('games').doc(id).collection('chat'),
  lobbyChat: (id: string) => db.collection('lobbies').doc(id).collection('chat'),
  history: () => db.collection('gameHistory'),
  historyDoc: (id: string) => db.collection('gameHistory').doc(id),
  reports: () => db.collection('reports'),
  rateLimit: (key: string) => db.collection('rateLimits').doc(key),
};

export const now = () => FieldValue.serverTimestamp();
export const millisFromNow = (ms: number) => Timestamp.fromMillis(Date.now() + ms);
