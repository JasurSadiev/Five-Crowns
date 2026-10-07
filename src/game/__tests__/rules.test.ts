import { describe, expect, it } from 'vitest';
import {
  cardsForRound,
  dealerIndexForRound,
  firstPlayerIndex,
  isValidPlayerCount,
  maxPlayersForRound,
  nextPlayerIndex,
  wildRankForRound,
} from '../rules';
import { cardScore } from '../scoring';
import { card } from './helpers';
import { isWild, rankPlural } from '../cards';

describe('round ladder and wild cards', () => {
  it('deals 3..13 cards across 11 rounds', () => {
    const expected = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    expected.forEach((count, index) => expect(cardsForRound(index + 1)).toBe(count));
  });

  it('rotates the wild rank with the deal', () => {
    expect(wildRankForRound(1)).toBe(3);
    expect(wildRankForRound(5)).toBe(7);
    expect(wildRankForRound(9)).toBe(11); // Jacks
    expect(wildRankForRound(10)).toBe(12); // Queens
    expect(wildRankForRound(11)).toBe(13); // Kings
  });

  it('rejects rounds outside 1..11', () => {
    expect(() => cardsForRound(0)).toThrow();
    expect(() => cardsForRound(12)).toThrow();
    expect(() => wildRankForRound(-1)).toThrow();
  });

  it('labels the wild rank for the HUD', () => {
    expect(rankPlural(7)).toBe('7s');
    expect(rankPlural(11)).toBe('Jacks');
    expect(rankPlural(13)).toBe('Kings');
  });

  it('treats every card of the wild rank and every joker as wild, in all 11 rounds', () => {
    for (let round = 1; round <= 11; round += 1) {
      const wild = wildRankForRound(round);
      expect(isWild(card('W1'), wild)).toBe(true);
      expect(isWild(card('W3', 2), wild)).toBe(true);
      for (const suit of ['t', 'h', 'c', 's', 'd']) {
        const label = wild === 11 ? 'J' : wild === 12 ? 'Q' : wild === 13 ? 'K' : String(wild);
        expect(isWild(card(`${label}${suit}`), wild)).toBe(true);
      }
      expect(isWild(card(wild === 3 ? '4h' : '3h'), wild)).toBe(false);
    }
  });

  it('scores wilds at 20 and jokers at 50 in every round', () => {
    expect(cardScore(card('7h'), 7)).toBe(20);
    expect(cardScore(card('7h'), 8)).toBe(7);
    expect(cardScore(card('Kh'), 13)).toBe(20);
    expect(cardScore(card('Kh'), 12)).toBe(13);
    expect(cardScore(card('Jh'), 5)).toBe(11);
    expect(cardScore(card('Qh'), 5)).toBe(12);
    expect(cardScore(card('W2'), 3)).toBe(50);
    expect(cardScore(card('10d'), 3)).toBe(10);
  });

  it('seats 2 to 7 players and fits 7 hands in round 11', () => {
    expect(isValidPlayerCount(1)).toBe(false);
    expect(isValidPlayerCount(2)).toBe(true);
    expect(isValidPlayerCount(7)).toBe(true);
    expect(isValidPlayerCount(8)).toBe(false);
    expect(maxPlayersForRound(11)).toBeGreaterThanOrEqual(7);
  });

  it('rotates the dealer each round and starts to the dealer left', () => {
    expect(dealerIndexForRound(1, 4)).toBe(0);
    expect(dealerIndexForRound(2, 4)).toBe(1);
    expect(dealerIndexForRound(5, 4)).toBe(0);
    expect(firstPlayerIndex(0, 4)).toBe(1);
    expect(firstPlayerIndex(3, 4)).toBe(0);
    expect(nextPlayerIndex(3, 4)).toBe(0);
  });
});
