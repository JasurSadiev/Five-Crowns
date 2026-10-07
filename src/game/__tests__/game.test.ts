import { describe, expect, it } from 'vitest';
import {
  currentPlayerId,
  discard,
  drawFromStock,
  startRound,
  takeDiscard,
  type RoundState,
} from '../turns';
import { cardsForRound, dealerIndexForRound, wildRankForRound, TOTAL_ROUNDS } from '../rules';
import {
  addRoundScores,
  computeRankings,
  leaderFromTotals,
  roundWinners,
  winnersFromTotals,
} from '../scoring';
import { findValidCombinations } from '../combinations';
import { seededRandom, type RandomSource } from '../rng';
import { validateDeckIntegrity } from '../deck';

/**
 * A deterministic greedy bot, used to play thousands of complete rounds and
 * prove the state machine always terminates with a legal, fully scored game.
 */
function playTurn(state: RoundState, uid: string, random: RandomSource): RoundState {
  const player = state.players[uid];
  const wild = state.wildRank;
  const before = findValidCombinations(player.hand, wild).best.leftoverScore;
  const top = state.discardPile[state.discardPile.length - 1];

  let working = state;
  let tookDiscard = false;
  if (top) {
    const withTop = findValidCombinations([...player.hand, top], wild);
    const after = withTop.bestAfterDiscard?.arrangement.leftoverScore ?? before;
    if (withTop.canGoOut || after < before) {
      const result = takeDiscard(working, uid);
      if (result.ok) {
        working = result.state;
        tookDiscard = true;
      }
    }
  }
  if (!tookDiscard) {
    const result = drawFromStock(working, uid, random);
    if (!result.ok) throw new Error(`draw failed: ${result.message}`);
    working = result.state;
  }

  const analysis = findValidCombinations(working.players[uid].hand, wild);
  if (analysis.canGoOut && working.status === 'playing') {
    const option = analysis.goOutOptions[0];
    const result = discard(working, uid, option.discard.id, { goOut: true, melds: option.melds });
    if (!result.ok) throw new Error(`go out failed: ${result.message}`);
    return result.state;
  }

  const toss =
    analysis.bestAfterDiscard?.discard ?? working.players[uid].hand[0];
  const result = discard(working, uid, toss.id);
  if (!result.ok) throw new Error(`discard failed: ${result.message}`);
  return result.state;
}

function playRound(round: number, players: string[], seed: number): RoundState {
  const dealerIndex = dealerIndexForRound(round, players.length);
  const random = seededRandom(seed);
  let state = startRound({ round, turnOrder: players, dealerIndex, random }).state;
  let guard = 0;
  while (state.status !== 'complete') {
    const uid = currentPlayerId(state);
    if (!uid) throw new Error('no current player');
    state = playTurn(state, uid, random);
    guard += 1;
    if (guard > 2000) throw new Error('round did not terminate');
  }
  return state;
}

interface GameResult {
  totals: Record<string, number>;
  rounds: Array<Record<string, number>>;
  winners: string[];
}

function playGame(players: string[], seed: number): GameResult {
  let totals: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const rounds: Array<Record<string, number>> = [];
  for (let round = 1; round <= TOTAL_ROUNDS; round += 1) {
    const state = playRound(round, players, seed + round * 101);
    expect(state.cardsDealt).toBe(cardsForRound(round));
    expect(state.wildRank).toBe(wildRankForRound(round));
    expect(state.turnOrder[state.dealerIndex]).toBe(players[(round - 1) % players.length]);
    expect(
      validateDeckIntegrity([
        state.drawPile,
        state.discardPile,
        ...Object.values(state.players).map((p) => p.hand),
        ...Object.values(state.players).flatMap((p) => p.melds.map((m) => m.cards)),
        ...Object.values(state.players).map((p) => p.leftover),
      ]).ok,
    ).toBe(true);

    const scores: Record<string, number> = {};
    for (const uid of players) {
      const score = state.players[uid].roundScore;
      expect(score).not.toBeNull();
      expect(score).toBeGreaterThanOrEqual(0);
      scores[uid] = score as number;
    }
    if (state.wentOutBy) expect(scores[state.wentOutBy]).toBe(0);
    rounds.push(scores);
    totals = addRoundScores(totals, scores);
  }
  return { totals, rounds, winners: winnersFromTotals(totals) };
}

describe('complete 11 round games', () => {
  it('plays a full four player game to a legal conclusion', () => {
    const players = ['alex', 'maria', 'jasur', 'john'];
    const { totals, rounds, winners } = playGame(players, 1);
    expect(rounds).toHaveLength(11);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    const lowest = Math.min(...Object.values(totals));
    winners.forEach((uid) => expect(totals[uid]).toBe(lowest));
    players.forEach((uid) => {
      expect(totals[uid]).toBe(rounds.reduce((sum, r) => sum + r[uid], 0));
    });
  });

  for (const count of [2, 3, 5, 7]) {
    it(`plays a full ${count} player game`, () => {
      const players = Array.from({ length: count }, (_, i) => `player${i}`);
      const { totals, winners } = playGame(players, count * 17);
      expect(Object.keys(totals)).toHaveLength(count);
      expect(winners.length).toBeGreaterThanOrEqual(1);
      Object.values(totals).forEach((total) => expect(total).toBeGreaterThanOrEqual(0));
    });
  }

  it('someone goes out in the overwhelming majority of rounds', () => {
    let wentOut = 0;
    const players = ['a', 'b', 'c'];
    for (let round = 1; round <= 11; round += 1) {
      const state = playRound(round, players, 500 + round);
      if (state.wentOutBy) wentOut += 1;
    }
    expect(wentOut).toBeGreaterThanOrEqual(9);
  });
});

describe('results, ranking and ties', () => {
  it('ranks by lowest cumulative score', () => {
    const rankings = computeRankings({ jasur: 87, alex: 102, maria: 119, john: 143 });
    expect(rankings.map((r) => r.uid)).toEqual(['jasur', 'alex', 'maria', 'john']);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[0].isWinner).toBe(true);
    expect(rankings[3].rank).toBe(4);
    expect(leaderFromTotals({ jasur: 87, alex: 102 })).toBe('jasur');
  });

  it('declares shared winners on a tie and keeps dense ranks', () => {
    const rankings = computeRankings({ a: 90, b: 90, c: 110 });
    expect(rankings.filter((r) => r.isWinner).map((r) => r.uid).sort()).toEqual(['a', 'b']);
    expect(rankings[0].rank).toBe(1);
    expect(rankings[1].rank).toBe(1);
    expect(rankings[2].rank).toBe(3);
    expect(winnersFromTotals({ a: 90, b: 90, c: 110 })).toHaveLength(2);
  });

  it('finds the winner of a single round', () => {
    expect(roundWinners({ alex: 12, maria: 19, jasur: 31, john: 7 })).toEqual(['john']);
  });

  it('accumulates round scores onto running totals', () => {
    let totals: Record<string, number> = { alex: 22, maria: 33 };
    totals = addRoundScores(totals, { alex: 12, maria: 19 });
    expect(totals).toEqual({ alex: 34, maria: 52 });
    totals = addRoundScores(totals, { alex: 0 });
    expect(totals).toEqual({ alex: 34, maria: 52 });
  });
});
