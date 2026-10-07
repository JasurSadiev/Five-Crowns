import { onCall } from 'firebase-functions/v2/https';
import * as functionsV1 from 'firebase-functions/v1';
import * as logger from 'firebase-functions/logger';
import { ENFORCE_APP_CHECK, FieldValue, REGION, auth, col, db } from './lib/admin';
import { appError, handler } from './lib/errors';
import { pairKey, rateLimit, requireAuth, requireString, validateUsername } from './lib/guards';
import {
  DEFAULT_PRIVACY_SETTINGS,
  DEFAULT_USER_SETTINGS,
} from './shared/types/player';

const BASE_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  totalScore: 0,
  bestScore: null as number | null,
  worstScore: null as number | null,
  averageScore: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  totalRoundScore: 0,
  currentStreak: 0,
  bestStreak: 0,
};

function suggestName(email: string | undefined, displayName: string | undefined): string {
  const base = (displayName || email?.split('@')[0] || 'Player')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 16);
  const safe = base.length >= 3 ? base : `Player${Math.floor(Math.random() * 9000) + 1000}`;
  return safe;
}

/** Picks a unique display name, appending digits when needed. */
async function allocateUsername(uid: string, preferred: string): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const candidate =
      attempt === 0 ? preferred : `${preferred.slice(0, 15)}${Math.floor(Math.random() * 9999)}`;
    const lower = candidate.toLowerCase();
    const taken = await db.runTransaction(async (tx) => {
      const snap = await tx.get(col.username(lower));
      if (snap.exists) return true;
      tx.set(col.username(lower), { uid, createdAt: FieldValue.serverTimestamp() });
      return false;
    });
    if (!taken) return candidate;
  }
  return `Player${Date.now().toString().slice(-6)}`;
}

interface NewUserInput {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

/**
 * Creates both profile documents. Statistics start at zero and can only ever
 * be changed by trusted server code.
 */
async function createProfileDocuments(input: NewUserInput): Promise<string> {
  const displayName = await allocateUsername(
    input.uid,
    suggestName(input.email ?? undefined, input.displayName ?? undefined),
  );
  const batch = db.batch();
  batch.set(
    col.user(input.uid),
    {
      uid: input.uid,
      displayName,
      displayNameLower: displayName.toLowerCase(),
      photoURL: input.photoURL,
      createdAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
      isOnline: true,
      presence: 'online',
      ...BASE_STATS,
    },
    { merge: true },
  );
  batch.set(
    col.userPrivate(input.uid),
    {
      uid: input.uid,
      email: input.email,
      emailVerified: input.emailVerified,
      settings: DEFAULT_USER_SETTINGS,
      privacy: DEFAULT_PRIVACY_SETTINGS,
      blocked: [],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
  return displayName;
}

/**
 * Auth trigger (v1 API - works with plain Firebase Auth, no Identity Platform
 * upgrade required). The client additionally calls `ensureProfile` after
 * sign-up so the first render never races the trigger.
 */
export const onUserCreated = functionsV1
  .region(REGION)
  .auth.user()
  .onCreate(async (user) => {
    try {
      const existing = await col.user(user.uid).get();
      if (existing.exists) return;
      await createProfileDocuments({
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        emailVerified: user.emailVerified ?? false,
      });
    } catch (error) {
      logger.error('onUserCreated failed', { uid: user.uid, error });
    }
  });

/** Self-heal: creates missing profile documents for an existing account. */
export const ensureProfile = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('ensureProfile', async (_data: unknown, uid: string) => {
      const snap = await col.user(uid).get();
      const record = await auth.getUser(uid).catch(() => null);
      if (snap.exists) {
        const priv = await col.userPrivate(uid).get();
        if (!priv.exists) {
          await col.userPrivate(uid).set({
            uid,
            email: record?.email ?? null,
            emailVerified: record?.emailVerified ?? false,
            settings: DEFAULT_USER_SETTINGS,
            privacy: DEFAULT_PRIVACY_SETTINGS,
            blocked: [],
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else if (record && priv.data()?.emailVerified !== record.emailVerified) {
          await col.userPrivate(uid).update({ emailVerified: record.emailVerified });
        }
        return { created: false, displayName: snap.data()?.displayName as string };
      }
      const displayName = await createProfileDocuments({
        uid,
        email: record?.email ?? null,
        displayName: record?.displayName ?? null,
        photoURL: record?.photoURL ?? null,
        emailVerified: record?.emailVerified ?? false,
      });
      return { created: true, displayName };
    })(request.data, requireAuth(request), request),
);

/** Changes the (globally unique) username. */
export const updateUsername = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('updateUsername', async (data: { displayName?: string }, uid: string) => {
      await rateLimit(uid, 'username', 5, 60 * 60 * 1000);
      const requested = validateUsername(requireString(data?.displayName, 'displayName', 20));
      const lower = requested.toLowerCase();

      await db.runTransaction(async (tx) => {
        const [nameSnap, userSnap] = await tx.getAll(col.username(lower), col.user(uid));
        if (!userSnap.exists) throw appError('user_not_found', 'not-found');
        const current = userSnap.data()?.displayName as string | undefined;
        if (current?.toLowerCase() === lower) {
          tx.update(col.user(uid), { displayName: requested, displayNameLower: lower });
          return;
        }
        if (nameSnap.exists) throw appError('username_taken', 'already-exists');
        tx.set(col.username(lower), { uid, createdAt: FieldValue.serverTimestamp() });
        if (current) tx.delete(col.username(current.toLowerCase()));
        tx.update(col.user(uid), { displayName: requested, displayNameLower: lower });
      });

      await auth.updateUser(uid, { displayName: requested }).catch(() => undefined);
      return { displayName: requested };
    })(request.data, requireAuth(request), request),
);

/** Updates the avatar URL (uploaded to Storage by the client, or a Google photo). */
export const updateAvatar = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('updateAvatar', async (data: { photoURL?: string | null }, uid: string) => {
      const photoURL = data?.photoURL ? requireString(data.photoURL, 'photoURL', 2000) : null;
      if (photoURL && !/^https:\/\//.test(photoURL)) {
        throw appError('invalid_argument', 'invalid-argument', 'Avatar must be an https URL.');
      }
      await col.user(uid).update({ photoURL });
      await auth.updateUser(uid, { photoURL: photoURL ?? undefined }).catch(() => undefined);
      return { photoURL };
    })(request.data, requireAuth(request), request),
);

/** Mirrors the verified flag from the Auth record into the private profile. */
export const syncEmailVerified = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('syncEmailVerified', async (_data: unknown, uid: string) => {
      const record = await auth.getUser(uid);
      await col.userPrivate(uid).set(
        {
          emailVerified: record.emailVerified,
          email: record.email ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { emailVerified: record.emailVerified };
    })(request.data, requireAuth(request), request),
);

/**
 * Permanently deletes an account: profile, username reservation, friendships,
 * invitations and the Auth user itself. Game history is kept (other players
 * need their results) but the name is anonymised.
 */
export const deleteAccount = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('deleteAccount', async (_data: unknown, uid: string) => {
      const userSnap = await col.user(uid).get();
      const displayName = (userSnap.data()?.displayName as string | undefined) ?? null;

      const activeGames = await col
        .games()
        .where('playerIds', 'array-contains', uid)
        .where('status', 'in', ['waiting', 'starting', 'playing', 'round_complete'])
        .get();
      if (!activeGames.empty) {
        throw appError(
          'game_in_progress',
          'failed-precondition',
          'Finish or leave your active games before deleting your account.',
        );
      }

      const batch = db.batch();
      if (displayName) batch.delete(col.username(displayName.toLowerCase()));
      batch.delete(col.userPrivate(uid));
      batch.delete(col.user(uid));

      const friendships = await col.friends().where('members', 'array-contains', uid).get();
      friendships.forEach((doc) => batch.delete(doc.ref));
      const sent = await col.invitations().where('senderId', '==', uid).get();
      sent.forEach((doc) => batch.delete(doc.ref));
      const received = await col.invitations().where('recipientId', '==', uid).get();
      received.forEach((doc) => batch.delete(doc.ref));
      const notifications = await col.notifications().where('uid', '==', uid).limit(400).get();
      notifications.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      await auth.deleteUser(uid);
      return { deleted: true };
    })(request.data, requireAuth(request), request),
);

/** Name search used by the friends page. Prefix search on the lower-cased name. */
export const searchPlayers = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('searchPlayers', async (data: { query?: string }, uid: string) => {
      const raw = requireString(data?.query, 'query', 30).toLowerCase();
      if (raw.length < 2) return { players: [] };
      const snap = await col
        .users()
        .orderBy('displayNameLower')
        .startAt(raw)
        .endAt(`${raw}\uf8ff`)
        .limit(12)
        .get();

      const privateSnap = await col.userPrivate(uid).get();
      const blocked = new Set<string>((privateSnap.data()?.blocked as string[]) ?? []);

      const players = snap.docs
        .map((doc) => doc.data())
        .filter((player) => player.uid !== uid && !blocked.has(player.uid as string))
        .map((player) => ({
          uid: player.uid as string,
          displayName: player.displayName as string,
          photoURL: (player.photoURL as string | null) ?? null,
          presence: (player.presence as string) ?? 'offline',
          gamesPlayed: (player.gamesPlayed as number) ?? 0,
          gamesWon: (player.gamesWon as number) ?? 0,
        }));
      return { players };
    })(request.data, requireAuth(request), request),
);

/** Reports a player, message or username for moderation review. */
export const submitReport = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'submitReport',
      async (
        data: { targetType?: string; targetId?: string; reason?: string; context?: string },
        uid: string,
      ) => {
        await rateLimit(uid, 'report', 10, 60 * 60 * 1000);
        const targetType = requireString(data?.targetType, 'targetType', 20);
        if (!['player', 'message', 'username'].includes(targetType)) {
          throw appError('invalid_argument', 'invalid-argument', 'Unknown report type.');
        }
        const targetId = requireString(data?.targetId, 'targetId', 200);
        if (targetId === uid) throw appError('self_action', 'failed-precondition');
        const reason = requireString(data?.reason, 'reason', 500);
        await col.reports().add({
          reporterId: uid,
          targetType,
          targetId,
          reason,
          context: data?.context ? String(data.context).slice(0, 500) : null,
          status: 'open',
          createdAt: FieldValue.serverTimestamp(),
        });
        return { submitted: true };
      },
    )(request.data, requireAuth(request), request),
);

export { pairKey };
