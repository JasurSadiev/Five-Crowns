import { onCall } from 'firebase-functions/v2/https';
import { ENFORCE_APP_CHECK, FieldValue, col } from './lib/admin';
import { appError, handler } from './lib/errors';
import { rateLimit, requireAuth, requireString } from './lib/guards';

const MAX_MESSAGE_LENGTH = 240;

/**
 * Chat is written through a Cloud Function so it can be rate limited
 * (10 messages per 30 seconds), length limited, and attributed to a verified
 * identity that a modified client cannot spoof.
 */
export const sendChatMessage = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'sendChatMessage',
      async (data: { gameId?: string; lobbyId?: string; text?: string }, uid: string) => {
        await rateLimit(uid, 'chat', 10, 30 * 1000);
        const text = requireString(data?.text, 'text', MAX_MESSAGE_LENGTH);
        if (text.length > MAX_MESSAGE_LENGTH) throw appError('message_too_long', 'invalid-argument');

        const profile = await col.user(uid).get();
        const message = {
          uid,
          displayName: (profile.data()?.displayName as string) ?? 'Player',
          photoURL: (profile.data()?.photoURL as string | null) ?? null,
          text,
          createdAt: FieldValue.serverTimestamp(),
          system: false,
        };

        if (data?.gameId) {
          const gameId = requireString(data.gameId, 'gameId', 64);
          const game = await col.game(gameId).get();
          if (!game.exists) throw appError('game_not_found', 'not-found');
          const playerIds = (game.data()?.playerIds as string[]) ?? [];
          const spectatorIds = (game.data()?.spectatorIds as string[]) ?? [];
          if (!playerIds.includes(uid) && !spectatorIds.includes(uid)) {
            throw appError('not_in_game', 'permission-denied');
          }
          if (game.data()?.settings?.enableChat === false) {
            throw appError('blocked', 'permission-denied');
          }
          const ref = col.gameChat(gameId).doc();
          await ref.set({ id: ref.id, ...message });
          return { messageId: ref.id };
        }

        const lobbyId = requireString(data?.lobbyId, 'lobbyId', 64);
        const lobby = await col.lobby(lobbyId).get();
        if (!lobby.exists) throw appError('lobby_not_found', 'not-found');
        if (!((lobby.data()?.playerIds as string[]) ?? []).includes(uid)) {
          throw appError('not_in_game', 'permission-denied');
        }
        const ref = col.lobbyChat(lobbyId).doc();
        await ref.set({ id: ref.id, ...message });
        return { messageId: ref.id };
      },
    )(request.data, requireAuth(request), request),
);
