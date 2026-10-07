"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIE_BREAK_WILD_RANK = exports.TIE_BREAK_CARDS = exports.MAX_PLAYERS = exports.MIN_PLAYERS = exports.TOTAL_ROUNDS = void 0;
exports.cardsForRound = cardsForRound;
exports.wildRankForRound = wildRankForRound;
exports.assertRound = assertRound;
exports.isValidPlayerCount = isValidPlayerCount;
exports.maxPlayersForRound = maxPlayersForRound;
exports.dealerIndexForRound = dealerIndexForRound;
exports.firstPlayerIndex = firstPlayerIndex;
exports.nextPlayerIndex = nextPlayerIndex;
exports.wildLabelForRound = wildLabelForRound;
const game_1 = require("../types/game");
Object.defineProperty(exports, "TOTAL_ROUNDS", { enumerable: true, get: function () { return game_1.TOTAL_ROUNDS; } });
Object.defineProperty(exports, "MIN_PLAYERS", { enumerable: true, get: function () { return game_1.MIN_PLAYERS; } });
Object.defineProperty(exports, "MAX_PLAYERS", { enumerable: true, get: function () { return game_1.MAX_PLAYERS; } });
const cards_1 = require("./cards");
/** Round 1 deals 3 cards, round 11 deals 13. */
function cardsForRound(round) {
    assertRound(round);
    return round + 2;
}
/** The number of cards dealt is also the wild rank: round 9 -> Jacks (11) wild. */
function wildRankForRound(round) {
    return cardsForRound(round);
}
function assertRound(round) {
    if (!Number.isInteger(round) || round < 1 || round > game_1.TOTAL_ROUNDS) {
        throw new Error(`Invalid round: ${round}`);
    }
}
function isValidPlayerCount(count) {
    return Number.isInteger(count) && count >= game_1.MIN_PLAYERS && count <= game_1.MAX_PLAYERS;
}
/**
 * The deck is 116 cards. Guarantees every player can be dealt a full hand with
 * at least one card left for the discard pile and some stock.
 */
function maxPlayersForRound(round, deckSize = 116) {
    return Math.floor((deckSize - 2) / cardsForRound(round));
}
/** Dealer rotates clockwise each round, starting with the host (index 0). */
function dealerIndexForRound(round, playerCount) {
    assertRound(round);
    if (playerCount <= 0)
        throw new Error('playerCount must be > 0');
    return (round - 1) % playerCount;
}
/** Play starts with the player to the dealer's left (clockwise). */
function firstPlayerIndex(dealerIndex, playerCount) {
    if (playerCount <= 0)
        throw new Error('playerCount must be > 0');
    return (dealerIndex + 1) % playerCount;
}
function nextPlayerIndex(currentIndex, playerCount) {
    if (playerCount <= 0)
        throw new Error('playerCount must be > 0');
    return (currentIndex + 1) % playerCount;
}
function wildLabelForRound(round) {
    return `${(0, cards_1.rankPlural)(wildRankForRound(round))} are wild`;
}
/** Six-card tie-break round described by the official rules. */
exports.TIE_BREAK_CARDS = 6;
exports.TIE_BREAK_WILD_RANK = 6;
//# sourceMappingURL=rules.js.map