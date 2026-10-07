import { describe, expect, it } from 'vitest';
import {
  CARDS_PER_DECK,
  FULL_DECK_SIZE,
  createDeck,
  createSingleDeck,
  dealCards,
  drawCard,
  drawDiscard,
  resetDeck,
  shuffleDeck,
  validateDeckIntegrity,
} from '../deck';
import { seededRandom } from '../rng';
import { RANKS, SUITS } from '../../types/card';

describe('deck', () => {
  it('builds a 58 card single deck', () => {
    const deck = createSingleDeck(1);
    expect(deck).toHaveLength(CARDS_PER_DECK);
    expect(deck.filter((c) => c.suit === 'joker')).toHaveLength(3);
    expect(deck.filter((c) => c.suit !== 'joker')).toHaveLength(55);
  });

  it('builds the full 116 card Five Crowns set', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(FULL_DECK_SIZE);
    expect(deck).toHaveLength(116);
    expect(deck.filter((c) => c.suit === 'joker')).toHaveLength(6);
  });

  it('contains exactly two of every suited card and no ranks below 3', () => {
    const deck = createDeck();
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const matches = deck.filter((c) => c.suit === suit && c.rank === rank);
        expect(matches).toHaveLength(2);
        expect(new Set(matches.map((c) => c.deck))).toEqual(new Set([1, 2]));
      }
    }
    expect(deck.some((c) => c.rank !== null && (c.rank < 3 || c.rank > 13))).toBe(false);
  });

  it('gives every physical card a unique id', () => {
    const deck = createDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(116);
  });

  it('shuffles without losing, duplicating or mutating cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, seededRandom(42));
    expect(shuffled).toHaveLength(116);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(116);
    expect(deck.map((c) => c.id).join()).toBe(createDeck().map((c) => c.id).join());
    expect(shuffled.map((c) => c.id).join()).not.toBe(deck.map((c) => c.id).join());
  });

  it('is deterministic for a given seed and different across seeds', () => {
    const a = shuffleDeck(createDeck(), seededRandom(7)).map((c) => c.id);
    const b = shuffleDeck(createDeck(), seededRandom(7)).map((c) => c.id);
    const c = shuffleDeck(createDeck(), seededRandom(8)).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('produces a reasonably uniform shuffle', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 600; seed += 1) {
      const top = shuffleDeck(createDeck(), seededRandom(seed))[0];
      counts.set(top.id, (counts.get(top.id) ?? 0) + 1);
    }
    // With 116 cards and 600 draws no single card should dominate.
    expect(Math.max(...counts.values())).toBeLessThan(40);
    expect(counts.size).toBeGreaterThan(90);
  });

  it('deals the right number of cards and starts the discard pile', () => {
    const deck = shuffleDeck(createDeck(), seededRandom(1));
    const { hands, drawPile, discardPile } = dealCards(deck, 4, 7);
    expect(hands).toHaveLength(4);
    hands.forEach((hand) => expect(hand).toHaveLength(7));
    expect(discardPile).toHaveLength(1);
    expect(drawPile).toHaveLength(116 - 28 - 1);
    expect(validateDeckIntegrity([...hands, drawPile, discardPile]).ok).toBe(true);
  });

  it('supports 7 players in round 11 (13 cards each)', () => {
    const { hands, drawPile } = dealCards(shuffleDeck(createDeck(), seededRandom(3)), 7, 13);
    expect(hands.every((h) => h.length === 13)).toBe(true);
    expect(drawPile.length).toBe(116 - 91 - 1);
    expect(drawPile.length).toBeGreaterThan(0);
  });

  it('draws from the top of the stock', () => {
    const deck = createDeck();
    const { card, drawPile } = drawCard(deck, []);
    expect(card.id).toBe(deck[0].id);
    expect(drawPile).toHaveLength(115);
  });

  it('recycles the discard pile when the stock runs out, keeping the top card', () => {
    const deck = createDeck();
    const discard = deck.slice(0, 10);
    const top = discard[discard.length - 1];
    const result = drawCard([], discard, seededRandom(5));
    expect(result.recycled).toBe(true);
    expect(result.discardPile).toHaveLength(1);
    expect(result.discardPile[0].id).toBe(top.id);
    expect(result.drawPile).toHaveLength(8);
  });

  it('only ever takes the single face-up discard', () => {
    const deck = createDeck();
    const pile = deck.slice(0, 5);
    const { card, discardPile } = drawDiscard(pile);
    expect(card.id).toBe(pile[4].id);
    expect(discardPile).toHaveLength(4);
  });

  it('detects a corrupted deck', () => {
    const deck = createDeck();
    expect(validateDeckIntegrity([deck]).ok).toBe(true);
    expect(validateDeckIntegrity([deck, [deck[0]]]).ok).toBe(false);
    expect(validateDeckIntegrity([deck.slice(1)]).ok).toBe(false);
  });

  it('resetDeck returns a pristine ordered set', () => {
    expect(resetDeck().map((c) => c.id)).toEqual(createDeck().map((c) => c.id));
  });
});
