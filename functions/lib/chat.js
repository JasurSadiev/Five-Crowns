"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendChatMessage = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
const MAX_MESSAGE_LENGTH = 240;
/**
 * Chat is written through a Cloud Function so it can be rate limited
 * (10 messages per 30 seconds), length limited, and attributed to a verified
 * identity that a modified client cannot spoof.
 */
exports.sendChatMessage = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('sendChatMessage', async (data, uid) => {
    await (0, guards_1.rateLimit)(uid, 'chat', 10, 30 * 1000);
    const text = (0, guards_1.requireString)(data?.text, 'text', MAX_MESSAGE_LENGTH);
    if (text.length > MAX_MESSAGE_LENGTH)
        throw (0, errors_1.appError)('message_too_long', 'invalid-argument');
    const profile = await admin_1.col.user(uid).get();
    const message = {
        uid,
        displayName: profile.data()?.displayName ?? 'Player',
        photoURL: profile.data()?.photoURL ?? null,
        text,
        createdAt: admin_1.FieldValue.serverTimestamp(),
        system: false,
    };
    if (data?.gameId) {
        const gameId = (0, guards_1.requireString)(data.gameId, 'gameId', 64);
        const game = await admin_1.col.game(gameId).get();
        if (!game.exists)
            throw (0, errors_1.appError)('game_not_found', 'not-found');
        const playerIds = game.data()?.playerIds ?? [];
        const spectatorIds = game.data()?.spectatorIds ?? [];
        if (!playerIds.includes(uid) && !spectatorIds.includes(uid)) {
            throw (0, errors_1.appError)('not_in_game', 'permission-denied');
        }
        if (game.data()?.settings?.enableChat === false) {
            throw (0, errors_1.appError)('blocked', 'permission-denied');
        }
        const ref = admin_1.col.gameChat(gameId).doc();
        await ref.set({ id: ref.id, ...message });
        return { messageId: ref.id };
    }
    const lobbyId = (0, guards_1.requireString)(data?.lobbyId, 'lobbyId', 64);
    const lobby = await admin_1.col.lobby(lobbyId).get();
    if (!lobby.exists)
        throw (0, errors_1.appError)('lobby_not_found', 'not-found');
    if (!(lobby.data()?.playerIds ?? []).includes(uid)) {
        throw (0, errors_1.appError)('not_in_game', 'permission-denied');
    }
    const ref = admin_1.col.lobbyChat(lobbyId).doc();
    await ref.set({ id: ref.id, ...message });
    return { messageId: ref.id };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=chat.js.map