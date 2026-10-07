import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { ENFORCE_APP_CHECK, FieldValue, col, db } from './lib/admin';
import { handler } from './lib/errors';
import { requireAuth } from './lib/guards';
import type { GameHistoryEntry } from './shared/types/game';

interface HistoryPlayer {
  uid: string;
  displayName: string;
  finalScore: number;
  rank: number;
  roundScores: number[];
}

/**
 * Statistics are derived from the immutable game history document, never from
 * anything a client sends. The update is a single transaction guarded by
 * `statsApplied`, so a retried trigger can not double count a game.
 */
export const updateStatistics = onDocumentCreated('gameHistory/{gameId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const gameId = event.params.gameId;

  try {
    await db.runTransaction(async (tx) => {
      const historyRef = col.historyDoc(gameId);
      const historySnap = await tx.get(historyRef);
      if (!historySnap.exists) return;
      const history = historySnap.data() as GameHistoryEntry & { statsApplied?: boolean };
      if (history.statsApplied) return;

      const players = (history.players ?? []) as HistoryPlayer[];
      if (!players.length) {
        tx.update(historyRef, { statsApplied: true });
        return;
      }

      const userRefs = players.map((player) => col.user(player.uid));
      const userSnaps = await tx.getAll(...userRefs);

      // Round winners: the lowest score in each round (ties count for all).
      const roundCount = Math.max(...players.map((player) => player.roundScores?.length ?? 0), 0);
      const roundWins: Record<string, number> = {};
      for (let round = 0; round < roundCount; round += 1) {
        const scores = players
          .map((player) => ({ uid: player.uid, score: player.roundScores?.[round] }))
          .filter((entry) => typeof entry.score === 'number') as Array<{
          uid: string;
          score: number;
        }>;
        if (!scores.length) continue;
        const lowest = Math.min(...scores.map((entry) => entry.score));
        scores
          .filter((entry) => entry.score === lowest)
          .forEach((entry) => {
            roundWins[entry.uid] = (roundWins[entry.uid] ?? 0) + 1;
          });
      }

      userSnaps.forEach((userSnap, index) => {
        const player = players[index];
        if (!userSnap.exists) return;
        const data = userSnap.data() ?? {};
        const won = (history.winnerIds ?? []).includes(player.uid);

        const gamesPlayed = (data.gamesPlayed ?? 0) + 1;
        const gamesWon = (data.gamesWon ?? 0) + (won ? 1 : 0);
        const gamesLost = (data.gamesLost ?? 0) + (won ? 0 : 1);
        const totalScore = (data.totalScore ?? 0) + player.finalScore;
        const bestScore =
          data.bestScore === null || data.bestScore === undefined
            ? player.finalScore
            : Math.min(data.bestScore as number, player.finalScore);
        const worstScore =
          data.worstScore === null || data.worstScore === undefined
            ? player.finalScore
            : Math.max(data.worstScore as number, player.finalScore);
        const roundsPlayed = (data.roundsPlayed ?? 0) + (player.roundScores?.length ?? 0);
        const totalRoundScore =
          (data.totalRoundScore ?? 0) +
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

      tx.update(historyRef, { statsApplied: true, statsAppliedAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    logger.error('updateStatistics failed', { gameId, error });
  }
});

export type LeaderboardScope = 'wins' | 'winRate' | 'lowestAverage' | 'gamesPlayed';

/**
 * Leaderboards are computed on demand from the authoritative user statistics.
 * Players with fewer than 3 completed games are excluded from the rate based
 * boards so a single lucky game cannot top the table.
 */
export const getLeaderboard = onCall(
  { enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) =>
    handler(
      'getLeaderboard',
      async (data: { scope?: LeaderboardScope; friendsOnly?: boolean }, uid: string) => {
        const scope: LeaderboardScope = (
          ['wins', 'winRate', 'lowestAverage', 'gamesPlayed'] as const
        ).includes(data?.scope as LeaderboardScope)
          ? (data?.scope as LeaderboardScope)
          : 'wins';

        let candidates = (
          await col.users().orderBy('gamesPlayed', 'desc').limit(250).get()
        ).docs.map((doc) => doc.data());

        if (data?.friendsOnly) {
          const friendships = await col
            .friends()
            .where('members', 'array-contains', uid)
            .where('status', '==', 'accepted')
            .get();
          const friendIds = new Set<string>([uid]);
          friendships.forEach((doc) => {
            ((doc.data().members as string[]) ?? []).forEach((member) => friendIds.add(member));
          });
          candidates = candidates.filter((player) => friendIds.has(player.uid as string));
        }

        const rows = candidates
          .filter((player) => (player.gamesPlayed ?? 0) > 0)
          .map((player) => ({
            uid: player.uid as string,
            displayName: (player.displayName as string) ?? 'Player',
            photoURL: (player.photoURL as string | null) ?? null,
            gamesPlayed: (player.gamesPlayed as number) ?? 0,
            gamesWon: (player.gamesWon as number) ?? 0,
            winRate:
              (player.gamesPlayed ?? 0) > 0
                ? Math.round(((player.gamesWon ?? 0) / (player.gamesPlayed as number)) * 1000) / 10
                : 0,
            averageScore: (player.averageScore as number) ?? 0,
            bestScore: (player.bestScore as number | null) ?? null,
            currentStreak: (player.currentStreak as number) ?? 0,
          }));

        const ranked = [...rows];
        if (scope === 'wins') ranked.sort((a, b) => b.gamesWon - a.gamesWon);
        if (scope === 'gamesPlayed') ranked.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
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
      },
    )(request.data, requireAuth(request), request),
);
