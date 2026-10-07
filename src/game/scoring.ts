import { DEFAULT_ENGINE_OPTIONS, type Card, type EngineOptions, type Meld, type Rank } from '../types/card';
import { JOKER_VALUE, WILD_VALUE, cardValue } from './cards';
import { bestArrangement } from './combinations';

export { JOKER_VALUE, WILD_VALUE };

/**
 * Card values:
 *   3-10  = face value
 *   J     = 11, Q = 12, K = 13
 *   the current wild rank = 20 (overrides the face value)
 *   joker = 50
 * Cards used inside a book or run are worth 0.
 */
export function cardScore(card: Card, wildRank: Rank): number {
  return cardValue(card, wildRank);
}

export interface HandScore {
  score: number;
  melds: Meld[];
  leftover: Card[];
}

/** Scores a hand by melding as much as possible (the best case for the player). */
export function scoreHand(
  hand: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): HandScore {
  const arrangement = bestArrangement(hand, wildRank, options);
  return {
    score: arrangement.leftoverScore,
    melds: arrangement.melds,
    leftover: arrangement.leftover,
  };
}

/** Scores an arrangement the player (or the server) already decided on. */
export function scoreLeftover(leftover: Card[], wildRank: Rank): number {
  return leftover.reduce((sum, card) => sum + cardScore(card, wildRank), 0);
}

export interface PlayerTotals {
  uid: string;
  total: number;
  roundScores: number[];
}

export function addRoundScores(
  totals: Record<string, number>,
  roundScores: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...totals };
  for (const [uid, score] of Object.entries(roundScores)) {
    next[uid] = (next[uid] ?? 0) + score;
  }
  return next;
}

export interface Ranking {
  uid: string;
  total: number;
  rank: number;
  isWinner: boolean;
}

/**
 * Lowest cumulative score wins. Equal scores share the same rank, which is how
 * the official "multiple winners" tie rule is represented.
 */
export function computeRankings(totals: Record<string, number>): Ranking[] {
  const entries = Object.entries(totals)
    .map(([uid, total]) => ({ uid, total }))
    .sort((a, b) => a.total - b.total || a.uid.localeCompare(b.uid));

  const rankings: Ranking[] = [];
  let currentRank = 0;
  let previousTotal: number | null = null;
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

export function winnersFromTotals(totals: Record<string, number>): string[] {
  return computeRankings(totals)
    .filter((entry) => entry.isWinner)
    .map((entry) => entry.uid);
}

export function roundWinners(roundScores: Record<string, number>): string[] {
  return winnersFromTotals(roundScores);
}

export function leaderFromTotals(totals: Record<string, number>): string | null {
  const rankings = computeRankings(totals);
  return rankings.length ? rankings[0].uid : null;
}
