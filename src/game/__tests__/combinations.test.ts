import { describe, expect, it } from 'vitest';
import {
  __clearCombinationCache,
  bestArrangement,
  canGoOut,
  canMeldAll,
  findValidCombinations,
  validateArrangement,
} from '../combinations';
import { hand } from './helpers';
import { validateBook } from '../books';
import { validateRun } from '../runs';
import { cardValue } from '../cards';
import type { Card, Rank } from '../../types/card';
import { createDeck, shuffleDeck } from '../deck';
import { seededRandom } from '../rng';

describe('combination solver - going out', () => {
  it('goes out with two clean books in round 1 (3 cards + draw)', () => {
    // Round 1: 3 cards dealt, 4 in hand after drawing.
    const h = hand('8c 8h 8s Kd');
    const analysis = findValidCombinations(h, 3);
    expect(analysis.canGoOut).toBe(true);
    expect(analysis.goOutOptions).toHaveLength(1);
    expect(analysis.goOutOptions[0].discard.id).toBe(h[3].id);
  });

  it('refuses to go out when one card is stranded', () => {
    expect(canGoOut(hand('8c 8h 9s Kd'), 3)).toBe(false);
  });

  it('splits a hand into a book and a run', () => {
    // 7 cards + draw = 8. Book of 4s + run 9d-10d-Jd, discard the K.
    const h = hand('4c 4h 4s 9d 10d Jd Kt');
    const analysis = findValidCombinations(h, 5);
    expect(analysis.canGoOut).toBe(true);
    expect(analysis.goOutOptions[0].discard.id).toBe(h[6].id);
    expect(analysis.goOutOptions[0].melds).toHaveLength(2);
  });

  it('uses the round wild rank inside both melds at once', () => {
    // Round 5 -> 7s wild. 7h completes the book, 7c completes the run.
    const h = hand('9c 9h 7h 4d 5d 7c Kt');
    const analysis = findValidCombinations(h, 7);
    expect(analysis.canGoOut).toBe(true);
    const discard = analysis.goOutOptions[0].discard;
    expect(discard.rank).toBe(13);
  });

  it('handles several jokers in the same hand', () => {
    const h = hand('W1 W2 8c 8h 3d 4d 5d Qt');
    const analysis = findValidCombinations(h, 10);
    expect(analysis.canGoOut).toBe(true);
  });

  it('allows an all-wild meld by default', () => {
    expect(canMeldAll(hand('W1 W2 W3'), 9)).toBe(true);
    expect(canMeldAll(hand('W1 W2 W3'), 9, { allowAllWildMelds: false })).toBe(false);
  });

  it('resolves ambiguous hands where a card is wanted by two melds', () => {
    // A greedy "books first" solver fails here: the 6h must stay in the run.
    const h = hand('5h 6h 7h 6c 6s 6d');
    expect(canMeldAll(h, 13)).toBe(true);
    const arrangement = bestArrangement(h, 13);
    expect(arrangement.leftoverScore).toBe(0);
    expect(arrangement.melds).toHaveLength(2);
    expect(arrangement.melds.map((m) => m.type).sort()).toEqual(['book', 'run']);
  });

  it('knows five cards must form a single meld (3 + 2 is impossible)', () => {
    expect(canMeldAll(hand('8c 8h 8s Kd Kt'), 3)).toBe(false);
    expect(canGoOut(hand('8c 8h 8s Kd Kt'), 3)).toBe(false);
  });

  it('reports every legal discard when more than one works', () => {
    // Discard the Q (book + 9-10-J) or the 9 (book + 10-J-Q): both go out.
    const h = hand('4c 4h 4s 9d 10d Jd Qd');
    const analysis = findValidCombinations(h, 5);
    expect(analysis.canGoOut).toBe(true);
    expect(analysis.goOutOptions).toHaveLength(2);
    expect(analysis.goOutOptions.map((o) => o.discard.rank).sort((a, b) => Number(a) - Number(b)))
      .toEqual([9, 12]);
  });

  it('lets the final discard be a card that would fit a meld', () => {
    // 8t would make the book four cards long; discarding it is still legal.
    const h = hand('8c 8h 8s 8t');
    const analysis = findValidCombinations(h, 3);
    expect(analysis.canGoOut).toBe(true);
    expect(analysis.goOutOptions).toHaveLength(4);
  });

  it('handles the largest possible hand (round 11, 14 cards) quickly', () => {
    const h = hand('3h 4h 5h 6c 6s 6d 9t 10t Jt Qd Qs Qc W1 7h');
    const started = Date.now();
    const analysis = findValidCombinations(h, 13);
    const elapsed = Date.now() - started;
    expect(analysis.canGoOut).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  it('never claims a hand of three can go out', () => {
    expect(canGoOut(hand('8c 8h 8s'), 3)).toBe(false);
  });
});

describe('combination solver - best arrangement and scoring', () => {
  it('melds nothing when nothing fits and reports the full penalty', () => {
    const arrangement = bestArrangement(hand('3h 5c 9s'), 13);
    expect(arrangement.melds).toHaveLength(0);
    expect(arrangement.leftoverScore).toBe(3 + 5 + 9);
  });

  it('spends the joker where it saves the most points', () => {
    // The joker could complete 3c-4c-5c (leaving 9h+9s = 18) but pairing it
    // with the nines instead leaves only 4+5 = 9.
    const arrangement = bestArrangement(hand('4c 5c W1 9h 9s'), 13);
    expect(arrangement.leftoverScore).toBe(9);
    expect(arrangement.melds).toHaveLength(1);
    expect(arrangement.melds[0].type).toBe('book');
  });

  it('never leaves a joker unmelded when it can be used', () => {
    const arrangement = bestArrangement(hand('W1 9h 9s 3c 4d'), 13);
    expect(arrangement.leftover.some((c) => c.suit === 'joker')).toBe(false);
    expect(arrangement.leftoverScore).toBe(7);
  });

  it('scores the documented example: Q + joker + 7 = 69', () => {
    const arrangement = bestArrangement(hand('Qh W1 7c'), 5);
    expect(arrangement.leftoverScore).toBe(69);
  });

  it('picks the best discard for an automatic turn', () => {
    const analysis = findValidCombinations(hand('8c 8h 8s W1 3d'), 13);
    expect(analysis.bestAfterDiscard?.discard.rank).toBe(3);
    expect(analysis.bestAfterDiscard?.arrangement.leftoverScore).toBe(0);
  });

  it('is deterministic - the same hand always yields the same answer', () => {
    const h = hand('3h 4h 5h 6c 6s 6d W1 Qd');
    __clearCombinationCache();
    const first = bestArrangement(h, 9);
    __clearCombinationCache();
    const second = bestArrangement([...h].reverse(), 9);
    expect(first.leftoverScore).toBe(second.leftoverScore);
  });
});

describe('arrangement validation (server side)', () => {
  const h = hand('8c 8h 8s 4d 5d 6d');

  it('accepts a legal player submitted arrangement', () => {
    const result = validateArrangement(
      h,
      [
        { type: 'book', cards: h.slice(0, 3) },
        { type: 'run', cards: h.slice(3) },
      ],
      13,
    );
    expect(result.valid).toBe(true);
    expect(result.leftoverScore).toBe(0);
  });

  it('rejects a meld containing a card the player does not hold', () => {
    const result = validateArrangement(
      h,
      [{ type: 'book', cards: hand('9c 9h 9s') }],
      13,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('unknown_card');
  });

  it('rejects using the same card in two melds', () => {
    const result = validateArrangement(
      h,
      [
        { type: 'book', cards: h.slice(0, 3) },
        { type: 'run', cards: [h[2], h[3], h[4]] },
      ],
      13,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('duplicate_card');
  });

  it('rejects an illegal meld', () => {
    const result = validateArrangement(h, [{ type: 'book', cards: [h[0], h[3], h[4]] }], 13);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_meld');
  });
});

describe('solver robustness', () => {
  it('survives 200 random 14 card hands without throwing', () => {
    const random = seededRandom(99);
    for (let i = 0; i < 200; i += 1) {
      const deck = shuffleDeck(createDeck(), random);
      const h = deck.slice(0, 14);
      const analysis = findValidCombinations(h, 13);
      expect(analysis.best.leftoverScore).toBeGreaterThanOrEqual(0);
      // Melded + leftover must always account for every card exactly once.
      const used = analysis.best.melds.flatMap((m) => m.cards.map((c) => c.id));
      const all = [...used, ...analysis.best.leftover.map((c) => c.id)];
      expect(new Set(all).size).toBe(14);
    }
  });

  it('agrees with a brute force search on small hands', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 60; i += 1) {
      const deck = shuffleDeck(createDeck(), random);
      const h = deck.slice(0, 6);
      const solver = bestArrangement(h, 9).leftoverScore;
      expect(solver).toBe(bruteForce(h, 9));
    }
  });
});

/** Independent exponential reference implementation used only by the tests. */
function bruteForce(cards: Card[], wildRank: Rank): number {
  const n = cards.length;
  const memo = new Map<number, number>();
  const solve = (mask: number): number => {
    if (mask === 0) return 0;
    const cached = memo.get(mask);
    if (cached !== undefined) return cached;
    let low = 0;
    while (!(mask & (1 << low))) low += 1;
    let best = cardValue(cards[low], wildRank as never) + solve(mask & ~(1 << low));
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & (1 << low))) continue;
      const subset: Card[] = [];
      for (let i = 0; i < n; i += 1) if (sub & (1 << i)) subset.push(cards[i]);
      if (subset.length < 3) continue;
      if (validateBook(subset, wildRank).valid || validateRun(subset, wildRank).valid) {
        best = Math.min(best, solve(mask & ~sub));
      }
    }
    memo.set(mask, best);
    return best;
  };
  return solve((1 << n) - 1);
}
