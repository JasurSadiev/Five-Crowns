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
exports.getLeaderboard = exports.updateStatistics = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin_1 = require("./lib/admin");
const errors_1 = require("./lib/errors");
const guards_1 = require("./lib/guards");
/**
 * Statistics are derived from the immutable game history document, never from
 * anything a client sends. The update is a single transaction guarded by
 * `statsApplied`, so a retried trigger can not double count a game.
 */
exports.updateStatistics = (0, firestore_1.onDocumentCreated)('gameHistory/{gameId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const gameId = event.params.gameId;
    try {
        await admin_1.db.runTransaction(async (tx) => {
            const historyRef = admin_1.col.historyDoc(gameId);
            const historySnap = await tx.get(historyRef);
            if (!historySnap.exists)
                return;
            const history = historySnap.data();
            if (history.statsApplied)
                return;
            const players = (history.players ?? []);
            if (!players.length) {
                tx.update(historyRef, { statsApplied: true });
                return;
            }
            const userRefs = players.map((player) => admin_1.col.user(player.uid));
            const userSnaps = await tx.getAll(...userRefs);
            // Round winners: the lowest score in each round (ties count for all).
            const roundCount = Math.max(...players.map((player) => player.roundScores?.length ?? 0), 0);
            const roundWins = {};
            for (let round = 0; round < roundCount; round += 1) {
                const scores = players
                    .map((player) => ({ uid: player.uid, score: player.roundScores?.[round] }))
                    .filter((entry) => typeof entry.score === 'number');
                if (!scores.length)
                    continue;
                const lowest = Math.min(...scores.map((entry) => entry.score));
                scores
                    .filter((entry) => entry.score === lowest)
                    .forEach((entry) => {
                    roundWins[entry.uid] = (roundWins[entry.uid] ?? 0) + 1;
                });
            }
            userSnaps.forEach((userSnap, index) => {
                const player = players[index];
                if (!userSnap.exists)
                    return;
                const data = userSnap.data() ?? {};
                const won = (history.winnerIds ?? []).includes(player.uid);
                const gamesPlayed = (data.gamesPlayed ?? 0) + 1;
                const gamesWon = (data.gamesWon ?? 0) + (won ? 1 : 0);
                const gamesLost = (data.gamesLost ?? 0) + (won ? 0 : 1);
                const totalScore = (data.totalScore ?? 0) + player.finalScore;
                const bestScore = data.bestScore === null || data.bestScore === undefined
                    ? player.finalScore
                    : Math.min(data.bestScore, player.finalScore);
                const worstScore = data.worstScore === null || data.worstScore === undefined
                    ? player.finalScore
                    : Math.max(data.worstScore, player.finalScore);
                const roundsPlayed = (data.roundsPlayed ?? 0) + (player.roundScores?.length ?? 0);
                const totalRoundScore = (data.totalRoundScore ?? 0) +
                    (player.roundScores ?? []).reduce((sum, score) => sum + score, 0);
                const currentStreak = won ? (data.currentStreak ?? 0) + 1 : 0;
                const bestStreak = Math.max(data.bestStreak ?? 0, currentStreak);
                tx.update(userSnap.ref, {
                    gamesPlayed,
                    gamesWon,
                    gamesLost,
                    totalScore,
                    bestScore,
                    worstScore,
                    averageScore: Math.round((totalScore / gamesPlayed) * 10) / 10,
                    roundsPlayed,
                    roundsWon: (data.roundsWon ?? 0) + (roundWins[player.uid] ?? 0),
                    totalRoundScore,
                    currentStreak,
                    bestStreak,
                });
            });
            tx.update(historyRef, { statsApplied: true, statsAppliedAt: admin_1.FieldValue.serverTimestamp() });
        });
    }
    catch (error) {
        logger.error('updateStatistics failed', { gameId, error });
    }
});
/**
 * Leaderboards are computed on demand from the authoritative user statistics.
 * Players with fewer than 3 completed games are excluded from the rate based
 * boards so a single lucky game cannot top the table.
 */
exports.getLeaderboard = (0, https_1.onCall)({ enforceAppCheck: admin_1.ENFORCE_APP_CHECK }, async (request) => (0, errors_1.handler)('getLeaderboard', async (data, uid) => {
    const scope = ['wins', 'winRate', 'lowestAverage', 'gamesPlayed'].includes(data?.scope)
        ? data?.scope
        : 'wins';
    let candidates = (await admin_1.col.users().orderBy('gamesPlayed', 'desc').limit(250).get()).docs.map((doc) => doc.data());
    if (data?.friendsOnly) {
        const friendships = await admin_1.col
            .friends()
            .where('members', 'array-contains', uid)
            .where('status', '==', 'accepted')
            .get();
        const friendIds = new Set([uid]);
        friendships.forEach((doc) => {
            (doc.data().members ?? []).forEach((member) => friendIds.add(member));
        });
        candidates = candidates.filter((player) => friendIds.has(player.uid));
    }
    const rows = candidates
        .filter((player) => (player.gamesPlayed ?? 0) > 0)
        .map((player) => ({
        uid: player.uid,
        displayName: player.displayName ?? 'Player',
        photoURL: player.photoURL ?? null,
        gamesPlayed: player.gamesPlayed ?? 0,
        gamesWon: player.gamesWon ?? 0,
        winRate: (player.gamesPlayed ?? 0) > 0
            ? Math.round(((player.gamesWon ?? 0) / player.gamesPlayed) * 1000) / 10
            : 0,
        averageScore: player.averageScore ?? 0,
        bestScore: player.bestScore ?? null,
        currentStreak: player.currentStreak ?? 0,
    }));
    const ranked = [...rows];
    if (scope === 'wins')
        ranked.sort((a, b) => b.gamesWon - a.gamesWon);
    if (scope === 'gamesPlayed')
        ranked.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
    if (scope === 'winRate') {
        ranked
            .filter((row) => row.gamesPlayed >= 3)
            .sort((a, b) => b.winRate - a.winRate || b.gamesWon - a.gamesWon);
    }
    if (scope === 'lowestAverage') {
        return {
            entries: ranked
                .filter((row) => row.gamesPlayed >= 3)
                .sort((a, b) => a.averageScore - b.averageScore)
                .slice(0, 50),
        };
    }
    if (scope === 'winRate') {
        return {
            entries: ranked
                .filter((row) => row.gamesPlayed >= 3)
                .sort((a, b) => b.winRate - a.winRate || b.gamesWon - a.gamesWon)
                .slice(0, 50),
        };
    }
    return { entries: ranked.slice(0, 50) };
})(request.data, (0, guards_1.requireAuth)(request), request));
//# sourceMappingURL=stats.js.map