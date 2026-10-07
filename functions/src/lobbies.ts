import { onCall } from 'firebase-functions/v2/https';
import { ENFORCE_APP_CHECK, FieldValue, Timestamp, col, db, millisFromNow } from './lib/admin';
import { appError, handler } from './lib/errors';
import {
  rateLimit,
  requireAuth,
  requireBoolean,
  requireNumber,
  requireString,
} from './lib/guards';
import { lobbyIdForCode, normaliseCode, releaseJoinCode, reserveJoinCode } from './lib/codes';
import { notifyMany } from './lib/notify';
import {
  DEFAULT_GAME_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameSettings,
  type LobbyPlayer,
} from './shared/types/game';

const LOBBY_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface SettingsInput extends Partial<GameSettings> {
  [key: string]: unknown;
}

/**
 * Only cosmetic / fairness-neutral options are configurable. Nothing here can
 * give a player an advantage: the card ladder, wild ranks, scoring and turn
 * order are fixed by the rules engine.
 */
function sanitiseSettings(input: SettingsInput | undefined, maxPlayers: number): GameSettings {
  const source = input ?? {};
  const privacy = source.privacy === 'public' ? 'public' : 'private';
  const roundAdvance = source.roundAdvance === 'auto' ? 'auto' : 'host';
  const tieBreak = source.tieBreak === 'tie_break_round' ? 'tie_break_round' : 'shared_win';
  return {
    ...DEFAULT_GAME_SETTINGS,
    privacy,
    maxPlayers,
    allowSpectators: requireBoolean(source.allowSpectators, DEFAULT_GAME_SETTINGS.allowSpectators),
    showAvatars: requireBoolean(source.showAvatars, DEFAULT_GAME_SETTINGS.showAvatars),
    enableSound: requireBoolean(source.enableSound, DEFAULT_GAME_SETTINGS.enableSound),
    enableAnimations: requireBoolean(
      source.enableAnimations,
      DEFAULT_GAME_SETTINGS.enableAnimations,
    ),
    enableChat: requireBoolean(source.enableChat, DEFAULT_GAME_SETTINGS.enableChat),
    turnTimeoutSeconds: clampTimeout(source.turnTimeoutSeconds),
    roundAdvance,
    autoAdvanceSeconds: Math.min(60, Math.max(5, Number(source.autoAdvanceSeconds) || 20)),
    tieBreak,
  };
}

function clampTimeout(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_GAME_SETTINGS.turnTimeoutSeconds;
  return Math.min(600, Math.max(30, Math.round(num)));
}

async function profileFor(uid: string): Promise<{ displayName: string; photoURL: string | null }> {
  const snap = await col.user(uid).get();
  if (!snap.exists) throw appError('user_not_found', 'not-found');
  return {
    displayName: (snap.data()?.displayName as string) ?? 'Player',
    photoURL: (snap.data()?.photoURL as string | null) ?? null,
  };
}

export const createLobby = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'createLobby',
      async (data: { maxPlayers?: number; settings?: SettingsInput }, uid: string) => {
        await rateLimit(uid, 'createLobby', 12, 10 * 60 * 1000);
        const maxPlayers = requireNumber(
          data?.maxPlayers ?? MAX_PLAYERS,
          'maxPlayers',
          MIN_PLAYERS,
          MAX_PLAYERS,
        );
        const settings = sanitiseSettings(data?.settings, maxPlayers);
        const profile = await profileFor(uid);

        // A player may only host one open lobby at a time.
        const existing = await col
          .lobbies()
          .where('hostId', '==', uid)
          .where('status', '==', 'open')
          .get();
        await Promise.all(
          existing.docs.map(async (doc) => {
            await releaseJoinCode(doc.data().joinCode as string);
            await doc.ref.update({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() });
          }),
        );

        const lobbyRef = col.lobbies().doc();
        const joinCode = await reserveJoinCode(lobbyRef.id);
        const host: LobbyPlayer = {
          uid,
          displayName: profile.displayName,
          photoURL: profile.photoURL,
          seat: 0,
          isHost: true,
          joinedAt: Timestamp.now(),
          ready: true,
        };

        await lobbyRef.set({
          id: lobbyRef.id,
          joinCode,
          hostId: uid,
          hostName: profile.displayName,
          status: 'open',
          gameType: 'classic',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: millisFromNow(LOBBY_TTL_MS),
          maxPlayers,
          playerIds: [uid],
          players: [host],
          settings,
          gameId: null,
        });

        return { lobbyId: lobbyRef.id, joinCode };
      },
    )(request.data, requireAuth(request), request),
);

async function joinLobbyById(lobbyId: string, uid: string): Promise<{ lobbyId: string }> {
  const profile = await profileFor(uid);
  await db.runTransaction(async (tx) => {
    const ref = col.lobby(lobbyId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw appError('lobby_not_found', 'not-found');
    const lobby = snap.data() as {
      status: string;
      playerIds: string[];
      players: LobbyPlayer[];
      maxPlayers: number;
    };
    if (lobby.status !== 'open') throw appError('lobby_closed', 'failed-precondition');
    if (lobby.playerIds.includes(uid)) return; // idempotent re-join
    if (lobby.playerIds.length >= lobby.maxPlayers) throw appError('lobby_full', 'failed-precondition');

    const usedSeats = new Set(lobby.players.map((player) => player.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat += 1;

    const player: LobbyPlayer = {
      uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      seat,
      isHost: false,
      joinedAt: Timestamp.now(),
      ready: true,
    };
    tx.update(ref, {
      playerIds: FieldValue.arrayUnion(uid),
      players: [...lobby.players, player],
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { lobbyId };
}

export const joinLobby = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('joinLobby', async (data: { lobbyId?: string }, uid: string) => {
      const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
      return joinLobbyById(lobbyId, uid);
    })(request.data, requireAuth(request), request),
);

export const joinLobbyByCode = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('joinLobbyByCode', async (data: { code?: string }, uid: string) => {
      await rateLimit(uid, 'joinByCode', 30, 10 * 60 * 1000);
      const code = normaliseCode(requireString(data?.code, 'code', 12));
      const lobbyId = await lobbyIdForCode(code);
      if (!lobbyId) throw appError('lobby_not_found', 'not-found');
      return joinLobbyById(lobbyId, uid);
    })(request.data, requireAuth(request), request),
);

export const leaveLobby = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('leaveLobby', async (data: { lobbyId?: string }, uid: string) => {
      const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
      let codeToRelease: string | null = null;

      await db.runTransaction(async (tx) => {
        const ref = col.lobby(lobbyId);
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const lobby = snap.data() as {
          hostId: string;
          status: string;
          joinCode: string;
          playerIds: string[];
          players: LobbyPlayer[];
        };
        if (!lobby.playerIds.includes(uid)) return;

        const remaining = lobby.players.filter((player) => player.uid !== uid);
        if (lobby.hostId === uid || remaining.length === 0) {
          codeToRelease = lobby.joinCode;
          tx.update(ref, {
            status: 'cancelled',
            playerIds: [],
            players: [],
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }
        tx.update(ref, {
          playerIds: FieldValue.arrayRemove(uid),
          players: remaining,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await releaseJoinCode(codeToRelease);
      return { left: true };
    })(request.data, requireAuth(request), request),
);

export const kickPlayer = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'kickPlayer',
      async (data: { lobbyId?: string; targetId?: string }, uid: string) => {
        const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
        const targetId = requireString(data?.targetId, 'targetId', 64);
        if (targetId === uid) throw appError('self_action', 'failed-precondition');

        await db.runTransaction(async (tx) => {
          const ref = col.lobby(lobbyId);
          const snap = await tx.get(ref);
          if (!snap.exists) throw appError('lobby_not_found', 'not-found');
          const lobby = snap.data() as {
            hostId: string;
            status: string;
            players: LobbyPlayer[];
            playerIds: string[];
          };
          if (lobby.hostId !== uid) throw appError('not_host', 'permission-denied');
          if (lobby.status !== 'open') throw appError('lobby_closed', 'failed-precondition');
          tx.update(ref, {
            playerIds: FieldValue.arrayRemove(targetId),
            players: lobby.players.filter((player) => player.uid !== targetId),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        return { removed: true };
      },
    )(request.data, requireAuth(request), request),
);

export const updateLobbySettings = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'updateLobbySettings',
      async (
        data: { lobbyId?: string; maxPlayers?: number; settings?: SettingsInput },
        uid: string,
      ) => {
        const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
        await db.runTransaction(async (tx) => {
          const ref = col.lobby(lobbyId);
          const snap = await tx.get(ref);
          if (!snap.exists) throw appError('lobby_not_found', 'not-found');
          const lobby = snap.data() as {
            hostId: string;
            status: string;
            playerIds: string[];
            settings: GameSettings;
            maxPlayers: number;
          };
          if (lobby.hostId !== uid) throw appError('not_host', 'permission-denied');
          if (lobby.status !== 'open') throw appError('lobby_closed', 'failed-precondition');
          const maxPlayers = requireNumber(
            data?.maxPlayers ?? lobby.maxPlayers,
            'maxPlayers',
            MIN_PLAYERS,
            MAX_PLAYERS,
          );
          if (maxPlayers < lobby.playerIds.length) {
            throw appError('too_many_players', 'failed-precondition');
          }
          tx.update(ref, {
            maxPlayers,
            settings: sanitiseSettings({ ...lobby.settings, ...data?.settings }, maxPlayers),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        return { updated: true };
      },
    )(request.data, requireAuth(request), request),
);

export const cancelLobby = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('cancelLobby', async (data: { lobbyId?: string }, uid: string) => {
      const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
      const snap = await col.lobby(lobbyId).get();
      if (!snap.exists) return { cancelled: true };
      if (snap.data()?.hostId !== uid) throw appError('not_host', 'permission-denied');

      const members: string[] = (snap.data()?.playerIds as string[]) ?? [];
      await col.lobby(lobbyId).update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await releaseJoinCode(snap.data()?.joinCode as string);

      const pending = await col
        .invitations()
        .where('lobbyId', '==', lobbyId)
        .where('status', '==', 'pending')
        .get();
      const batch = db.batch();
      pending.forEach((doc) => batch.update(doc.ref, { status: 'cancelled' }));
      await batch.commit();

      await notifyMany(
        members
          .filter((member) => member !== uid)
          .map((member) => ({
            uid: member,
            type: 'system' as const,
            title: 'Lobby closed',
            body: 'The host cancelled the lobby.',
            link: '/app',
          })),
      );
      return { cancelled: true };
    })(request.data, requireAuth(request), request),
);

/** Public lobby browser. Returns open, non-full public lobbies. */
export const listPublicLobbies = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler('listPublicLobbies', async () => {
      const snap = await col
        .lobbies()
        .where('settings.privacy', '==', 'public')
        .where('status', '==', 'open')
        .orderBy('createdAt', 'desc')
        .limit(25)
        .get();
      const lobbies = snap.docs
        .map((doc) => doc.data())
        .filter((lobby) => (lobby.playerIds as string[]).length < (lobby.maxPlayers as number))
        .map((lobby) => ({
          id: lobby.id as string,
          hostName: lobby.hostName as string,
          joinCode: lobby.joinCode as string,
          players: (lobby.playerIds as string[]).length,
          maxPlayers: lobby.maxPlayers as number,
          allowSpectators: Boolean((lobby.settings as GameSettings)?.allowSpectators),
        }));
      return { lobbies };
    })(request.data, requireAuth(request), request),
);
