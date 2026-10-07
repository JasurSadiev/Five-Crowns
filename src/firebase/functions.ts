import { getFunctions, httpsCallable } from 'firebase/functions';
import { FUNCTIONS_REGION, USE_EMULATORS, app, auth } from './config';
import { friendlyError } from '../utils/errors';

/**
 * Typed gateway to the trusted server.
 *
 * In production we use the Firebase SDK (which attaches the auth token and the
 * App Check token automatically). When the emulators are in use we post to the
 * callable protocol through the Vite proxy so everything stays same-origin.
 */

const functionsInstance = getFunctions(app, FUNCTIONS_REGION);

async function callViaProxy<TData, TResult>(name: string, data: TData): Promise<TResult> {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/__fn/${import.meta.env.VITE_FIREBASE_PROJECT_ID}/${FUNCTIONS_REGION}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: data ?? {} }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    result?: TResult;
    error?: { message?: string; status?: string; details?: { code?: string } };
  };
  if (body.error) {
    throw Object.assign(new Error(body.error.message ?? 'Request failed'), {
      code: body.error.details?.code ?? body.error.status ?? 'internal',
    });
  }
  return body.result as TResult;
}

export async function call<TData extends object, TResult = unknown>(
  name: string,
  data?: TData,
): Promise<TResult> {
  try {
    if (USE_EMULATORS) return await callViaProxy<TData | object, TResult>(name, data ?? {});
    const callable = httpsCallable<TData | object, TResult>(functionsInstance, name);
    const result = await callable(data ?? {});
    return result.data;
  } catch (error) {
    throw friendlyError(error);
  }
}

/** Generates a request id so a retried action is never applied twice. */
export function newRequestId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && 'randomUUID' in cryptoObj) return cryptoObj.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ------------------------------------------------------------------ */
/* The full server API, in one typed place.                           */
/* ------------------------------------------------------------------ */

export const api = {
  // profile
  ensureProfile: () => call<object, { created: boolean; displayName: string }>('ensureProfile'),
  updateUsername: (displayName: string) =>
    call<{ displayName: string }, { displayName: string }>('updateUsername', { displayName }),
  updateAvatar: (photoURL: string | null) =>
    call<{ photoURL: string | null }, { photoURL: string | null }>('updateAvatar', { photoURL }),
  syncEmailVerified: () => call<object, { emailVerified: boolean }>('syncEmailVerified'),
  deleteAccount: () => call<object, { deleted: boolean }>('deleteAccount'),
  searchPlayers: (query: string) =>
    call<{ query: string }, { players: SearchedPlayer[] }>('searchPlayers', { query }),
  submitReport: (input: {
    targetType: 'player' | 'message' | 'username';
    targetId: string;
    reason: string;
    context?: string;
  }) => call<typeof input, { submitted: boolean }>('submitReport', input),

  // lobbies
  createLobby: (input: { maxPlayers: number; settings: Record<string, unknown> }) =>
    call<typeof input, { lobbyId: string; joinCode: string }>('createLobby', input),
  joinLobby: (lobbyId: string) => call<{ lobbyId: string }, { lobbyId: string }>('joinLobby', { lobbyId }),
  joinLobbyByCode: (code: string) =>
    call<{ code: string }, { lobbyId: string }>('joinLobbyByCode', { code }),
  leaveLobby: (lobbyId: string) => call<{ lobbyId: string }, { left: boolean }>('leaveLobby', { lobbyId }),
  kickPlayer: (lobbyId: string, targetId: string) =>
    call<{ lobbyId: string; targetId: string }, { removed: boolean }>('kickPlayer', {
      lobbyId,
      targetId,
    }),
  updateLobbySettings: (input: {
    lobbyId: string;
    maxPlayers?: number;
    settings?: Record<string, unknown>;
  }) => call<typeof input, { updated: boolean }>('updateLobbySettings', input),
  cancelLobby: (lobbyId: string) =>
    call<{ lobbyId: string }, { cancelled: boolean }>('cancelLobby', { lobbyId }),
  listPublicLobbies: () => call<object, { lobbies: PublicLobby[] }>('listPublicLobbies'),

  // invitations
  invitePlayer: (lobbyId: string, recipientId: string) =>
    call<{ lobbyId: string; recipientId: string }, { invitationId: string }>('invitePlayer', {
      lobbyId,
      recipientId,
    }),
  respondToInvitation: (invitationId: string, accept: boolean) =>
    call<{ invitationId: string; accept: boolean }, { lobbyId: string | null }>(
      'respondToInvitation',
      { invitationId, accept },
    ),
  cancelInvitation: (invitationId: string) =>
    call<{ invitationId: string }, { cancelled: boolean }>('cancelInvitation', { invitationId }),

  // friends
  sendFriendRequest: (targetId: string) =>
    call<{ targetId: string }, { sent: boolean }>('sendFriendRequest', { targetId }),
  respondToFriendRequest: (pairKey: string, accept: boolean) =>
    call<{ pairKey: string; accept: boolean }, { accepted: boolean }>('respondToFriendRequest', {
      pairKey,
      accept,
    }),
  removeFriend: (targetId: string) =>
    call<{ targetId: string }, { removed: boolean }>('removeFriend', { targetId }),
  blockPlayer: (targetId: string) =>
    call<{ targetId: string }, { blocked: boolean }>('blockPlayer', { targetId }),
  unblockPlayer: (targetId: string) =>
    call<{ targetId: string }, { unblocked: boolean }>('unblockPlayer', { targetId }),

  // gameplay
  startGame: (lobbyId: string) => call<{ lobbyId: string }, { gameId: string }>('startGame', { lobbyId }),
  drawCard: (gameId: string, requestId: string) =>
    call<{ gameId: string; requestId: string }, { ok: boolean }>('drawCard', { gameId, requestId }),
  takeDiscard: (gameId: string, requestId: string) =>
    call<{ gameId: string; requestId: string }, { ok: boolean }>('takeDiscard', {
      gameId,
      requestId,
    }),
  discardCard: (input: {
    gameId: string;
    cardId: string;
    requestId: string;
    melds?: Array<{ type: string; cards: Array<{ id: string }> }>;
  }) => call<typeof input, { ok: boolean }>('discardCard', input),
  goOut: (input: {
    gameId: string;
    cardId: string;
    requestId: string;
    melds?: Array<{ type: string; cards: Array<{ id: string }> }>;
  }) => call<typeof input, { ok: boolean }>('goOut', input),
  advanceRound: (gameId: string) =>
    call<{ gameId: string }, { finished: boolean }>('advanceRound', { gameId }),
  enforceTurnTimeout: (gameId: string) =>
    call<{ gameId: string }, { timedOut: string | null }>('enforceTurnTimeout', { gameId }),
  pingGame: (gameId: string) => call<{ gameId: string }, { ok: boolean }>('pingGame', { gameId }),
  joinAsSpectator: (gameId: string) =>
    call<{ gameId: string }, { spectating: boolean }>('joinAsSpectator', { gameId }),
  leaveGame: (gameId: string) => call<{ gameId: string }, { left: boolean }>('leaveGame', { gameId }),

  // chat
  sendChatMessage: (input: { gameId?: string; lobbyId?: string; text: string }) =>
    call<typeof input, { messageId: string }>('sendChatMessage', input),

  // leaderboard
  getLeaderboard: (scope: string, friendsOnly = false) =>
    call<{ scope: string; friendsOnly: boolean }, { entries: LeaderboardRow[] }>('getLeaderboard', {
      scope,
      friendsOnly,
    }),
};

export interface SearchedPlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  presence: string;
  gamesPlayed: number;
  gamesWon: number;
}

export interface PublicLobby {
  id: string;
  hostName: string;
  joinCode: string;
  players: number;
  maxPlayers: number;
  allowSpectators: boolean;
}

export interface LeaderboardRow {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  averageScore: number;
  bestScore: number | null;
  currentStreak: number;
}
