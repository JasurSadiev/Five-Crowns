"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WILD_VALUE = exports.JOKER_VALUE = void 0;
exports.cardScore = cardScore;
exports.scoreHand = scoreHand;
exports.scoreLeftover = scoreLeftover;
exports.addRoundScores = addRoundScores;
exports.computeRankings = computeRankings;
exports.winnersFromTotals = winnersFromTotals;
exports.roundWinners = roundWinners;
exports.leaderFromTotals = leaderFromTotals;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
Object.defineProperty(exports, "JOKER_VALUE", { enumerable: true, get: function () { return cards_1.JOKER_VALUE; } });
Object.defineProperty(exports, "WILD_VALUE", { enumerable: true, get: function () { return cards_1.WILD_VALUE; } });
const combinations_1 = require("./combinations");
/**
 * Card values:
 *   3-10  = face value
 *   J     = 11, Q = 12, K = 13
 *   the current wild rank = 20 (overrides the face value)
 *   joker = 50
 * Cards used inside a book or run are worth 0.
 */
function cardScore(card, wildRank) {
    return (0, cards_1.cardValue)(card, wildRank);
}
/** Scores a hand by melding as much as possible (the best case for the player). */
function scoreHand(hand, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    const arrangement = (0, combinations_1.bestArrangement)(hand, wildRank, options);
    return {
        score: arrangement.leftoverScore,
        melds: arrangement.melds,
        leftover: arrangement.leftover,
    };
}
/** Scores an arrangement the player (or the server) already decided on. */
function scoreLeftover(leftover, wildRank) {
    return leftover.reduce((sum, card) => sum + cardScore(card, wildRank), 0);
}
function addRoundScores(totals, roundScores) {
    const next = { ...totals };
    for (const [uid, score] of Object.entries(roundScores)) {
        next[uid] = (next[uid] ?? 0) + score;
    }
    return next;
}
/**
 * Lowest cumulative score wins. Equal scores share the same rank, which is how
 * the official "multiple winners" tie rule is represented.
 */
function computeRankings(totals) {
    const entries = Object.entries(totals)
        .map(([uid, total]) => ({ uid, total }))
        .sort((a, b) => a.total - b.total || a.uid.localeCompare(b.uid));
    const rankings = [];
    let currentRank = 0;
    let previousTotal = null;
    entries.forEach((entry, index) => {
        if (previousTotal === null || entry.total !== previousTotal) {
            currentRank = index + 1;
            previousTotal = entry.total;
        }
        rankings.push({ uid: entry.uid, total: entry.total, rank: currentRank, isWinner: false });
    });
    const lowest = rankings.length ? rankings[0].total : 0;
    for (const ranking of rankings) {
        ranking.isWinner = ranking.total === lowest;
    }
    return rankings;
}
function winnersFromTotals(totals) {
    return computeRankings(totals)
        .filter((entry) => entry.isWinner)
        .map((entry) => entry.uid);
}
function roundWinners(roundScores) {
    return winnersFromTotals(roundScores);
}
function leaderFromTotals(totals) {
    const rankings = computeRankings(totals);
    return rankings.length ? rankings[0].uid : null;
}
//# sourceMappingURL=scoring.js.map