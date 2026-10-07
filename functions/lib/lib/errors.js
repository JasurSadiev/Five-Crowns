"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.appError = appError;
exports.friendlyMessage = friendlyMessage;
exports.handler = handler;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
/**
 * Every error that reaches the browser is written in plain language.
 * Raw Firebase/Admin SDK errors are logged server side and replaced with a
 * generic message so internals are never leaked to a player.
 */
const MESSAGES = {
    not_your_turn: 'It is not your turn.',
    already_drawn: 'You have already drawn this turn.',
    must_draw_first: 'Draw a card or take the discard before discarding.',
    card_not_in_hand: 'That card is not in your hand.',
    cannot_go_out: 'Your remaining cards do not form valid books and runs.',
    round_not_active: 'This round has already finished.',
    empty_discard: 'The discard pile is empty.',
    no_cards_left: 'There are no cards left to draw.',
    invalid_arrangement: 'That arrangement is not legal.',
    unknown_player: 'You are not seated in this game.',
    lobby_not_found: 'This lobby no longer exists.',
    lobby_full: 'That lobby is already full.',
    lobby_closed: 'The game has already started.',
    game_not_found: 'That game could not be found.',
    invitation_expired: 'That invitation has expired.',
    invitation_handled: 'That invitation has already been answered.',
    not_host: 'Only the host can do that.',
    not_enough_players: 'You need at least 2 players to start.',
    rate_limited: 'You are doing that too quickly. Please slow down.',
    username_taken: 'That username is already taken.',
    invalid_username: 'Usernames are 3-20 characters: letters, numbers, _ . and -',
    already_invited: 'That player has already been invited.',
    already_in_lobby: 'That player is already in the lobby.',
    user_not_found: 'We could not find that player.',
    blocked: 'You cannot contact this player.',
    invitations_disabled: 'This player is not accepting game invitations.',
    friend_requests_disabled: 'This player is not accepting friend requests.',
    self_action: 'You cannot do that to yourself.',
    message_too_long: 'That message is too long.',
    already_friends: 'You are already friends.',
    not_in_game: 'You are not part of this game.',
    round_in_progress: 'The round is still being played.',
    game_finished: 'This game has already finished.',
    too_many_players: 'That is more players than this game allows.',
    unauthenticated: 'Please sign in to continue.',
};
class AppError extends Error {
    code;
    httpsCode;
    constructor(code, httpsCode = 'failed-precondition', message) {
        super(message ?? MESSAGES[code] ?? 'Something went wrong. Please try again.');
        this.code = code;
        this.httpsCode = httpsCode;
    }
}
exports.AppError = AppError;
function appError(code, httpsCode = 'failed-precondition', message) {
    return new AppError(code, httpsCode, message);
}
function friendlyMessage(code) {
    return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}
/** Wraps a handler so unexpected errors never leak implementation details. */
function handler(name, fn) {
    return async (data, uid, raw) => {
        try {
            return await fn(data, uid, raw);
        }
        catch (error) {
            if (error instanceof AppError) {
                throw new https_1.HttpsError(error.httpsCode, error.message, { code: error.code });
            }
            if (error instanceof https_1.HttpsError)
                throw error;
            logger.error(`[${name}] unhandled error`, { uid, error });
            throw new https_1.HttpsError('internal', 'Something went wrong. Please try again.', {
                code: 'internal',
            });
        }
    };
}
//# sourceMappingURL=errors.js.map