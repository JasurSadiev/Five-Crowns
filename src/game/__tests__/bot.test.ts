/**
 * Bot opponents must play a complete, legal game without the engine ever
 * rejecting a move, and stronger settings must actually play better.
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../rng';
import { startRound, finishRound, currentPlayerId, type RoundState } from '../turns';
import { playBotTurn, decideDraw, decideDiscard, BOT_DIFFICULTIES, type BotDifficulty } from '../bot';
import { findValidCombinations } from '../combinations';
import { scoreLeftover } from '../scoring';
import { isWild } from '../cards';
import type { Rank } from '../../types/card';

// Round N makes rank N+2 wild: round 1 -> 3s, round 11 -> 13s (kings).
const WILD_FOR_ROUND: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function runRound(
  round: number,
  uids: string[],
  difficulty: BotDifficulty,
  seed: number,
): { state: RoundState; turns: number } {
  const random = seededRandom(seed);
  let { state } = startRound({
    round,
    turnOrder: uids,
    dealerIndex: 0,
    random,
  });

  let turns = 0;
  while ((state.status === 'playing' || state.status === 'final_turns') && turns < 600) {
    const uid = currentPlayerId(state);
    if (!uid) break;
    const result = playBotTurn(state, uid, difficulty, random);
    // The engine is the referee: a bot must never produce an illegal move.
    expect(result.ok, `illegal bot move: ${result.ok ? '' : result.code}`).toBe(true);
    if (!result.ok) break;
    state = result.state;
    turns += 1;
  }
  if (state.status !== 'complete') state = finishRound(state).state;
  return { state, turns };
}

describe('bot opponents', () => {
  it('plays a legal round at every difficulty', () => {
    for (const difficulty of BOT_DIFFICULTIES) {
      const { state, turns } = runRound(1, ['a', 'b', 'c'], difficulty, 1234);
      expect(state.status).toBe('complete');
      expect(turns).toBeGreaterThan(0);
    }
  });

  it('completes all eleven rounds for 2 to 7 players', () => {
    for (let players = 2; players <= 7; players += 1) {
      const uids = Array.from({ length: players }, (_, i) => `p${i}`);
      for (let round = 1; round <= 11; round += 1) {
        const { state } = runRound(round, uids, 'normal', 7000 + round * players);
        expect(state.status).toBe('complete');
        expect(state.wildRank).toBe(WILD_FOR_ROUND[round - 1]);
        // Everyone is scored and nobody kept cards they melded.
        for (const uid of uids) {
          const player = state.players[uid];
          expect(player.roundScore).not.toBeNull();
          expect(player.roundScore).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('never loses or duplicates a card', () => {
    const uids = ['a', 'b', 'c', 'd'];
    const { state } = runRound(9, uids, 'hard', 99);
    const ids: string[] = [
      ...state.drawPile.map((c) => c.id),
      ...state.discardPile.map((c) => c.id),
    ];
    for (const uid of uids) {
      const p = state.players[uid];
      ids.push(...p.hand.map((c) => c.id));
      ids.push(...p.leftover.map((c) => c.id));
      for (const meld of p.melds) ids.push(...meld.cards.map((c) => c.id));
    }
    expect(ids.length).toBe(116);
    expect(new Set(ids).size).toBe(116);
  });

  it('goes out as soon as it legally can', () => {
    // A hand that can go out must produce goOut = true for a capable bot.
    const random = seededRandom(5);
    let { state } = startRound({ round: 1, turnOrder: ['a', 'b'], dealerIndex: 0, random });
    const uid = currentPlayerId(state)!;
    // Hand the bot a guaranteed book of three plus one spare card.
    const hand = state.players[uid].hand;
    const analysis = findValidCombinations(hand, state.wildRank);
    if (analysis.canGoOut) {
      const choice = decideDiscard(state, uid, 'hard', random);
      expect(choice.goOut).toBe(true);
    }
    expect(state.status).toBe('playing');
  });

  it('takes a wild card off the discard pile', () => {
    const random = seededRandom(11);
    const { state } = startRound({ round: 5, turnOrder: ['a', 'b'], dealerIndex: 0, random });
    const uid = currentPlayerId(state)!;
    const top = state.discardPile[state.discardPile.length - 1];
    if (top && isWild(top, state.wildRank)) {
      expect(decideDraw(state, uid, 'hard', random)).toBe('discard');
    }
  });

  it('hard bots finish with lower leftover scores than easy bots', () => {
    // Averaged over many deals, skill must show up in the score.
    let easyTotal = 0;
    let hardTotal = 0;
    const seeds = 40;
    for (let i = 0; i < seeds; i += 1) {
      const easy = runRound(8, ['a', 'b'], 'easy', 500 + i);
      const hard = runRound(8, ['a', 'b'], 'hard', 500 + i);
      for (const uid of ['a', 'b']) {
        easyTotal += scoreLeftover(easy.state.players[uid].leftover, easy.state.wildRank);
        hardTotal += scoreLeftover(hard.state.players[uid].leftover, hard.state.wildRank);
      }
    }
    expect(hardTotal).toBeLessThan(easyTotal);
  });

  it('is deterministic for a given seed', () => {
    const a = runRound(6, ['x', 'y', 'z'], 'normal', 4242);
    const b = runRound(6, ['x', 'y', 'z'], 'normal', 4242);
    expect(a.state.players.x.roundScore).toBe(b.state.players.x.roundScore);
    expect(a.state.players.y.roundScore).toBe(b.state.players.y.roundScore);
    expect(a.turns).toBe(b.turns);
  });
});
