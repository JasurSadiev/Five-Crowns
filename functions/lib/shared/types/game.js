"use strict";
/**
 * Game, round and lobby documents.
 *
 * These types are shared verbatim between the browser bundle and the Cloud
 * Functions bundle (see `scripts/sync-engine.mjs`), so they must never import
 * from `firebase/*` or `firebase-admin/*`. Timestamps are therefore modelled
 * structurally.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOTAL_ROUNDS = exports.MAX_PLAYERS = exports.MIN_PLAYERS = exports.DEFAULT_GAME_SETTINGS = void 0;
exports.DEFAULT_GAME_SETTINGS = {
    privacy: 'private',
    maxPlayers: 7,
    allowSpectators: false,
    showAvatars: true,
    enableSound: true,
    enableAnimations: true,
    enableChat: true,
    turnTimeoutSeconds: 120,
    roundAdvance: 'host',
    autoAdvanceSeconds: 20,
    tieBreak: 'shared_win',
};
exports.MIN_PLAYERS = 2;
exports.MAX_PLAYERS = 7;
exports.TOTAL_ROUNDS = 11;
//# sourceMappingURL=game.js.map