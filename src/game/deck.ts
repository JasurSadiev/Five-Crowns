import type { Card, DeckNumber, Rank } from '../types/card';
import { RANKS, SUITS } from '../types/card';
import { makeCard, makeJoker } from './cards';
import { randomInt, secureRandom, type RandomSource } from './rng';

export const CARDS_PER_DECK = 58;
export const JOKERS_PER_DECK = 3;
export const FULL_DECK_SIZE = CARDS_PER_DECK * 2; // 116

/** Builds one 58-card Five Crowns deck (55 suited cards + 3 jokers). */
export function createSingleDeck(deck: DeckNumber): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(makeCard(deck, suit, rank as Rank));
    }
  }
  for (const index of [1, 2, 3] as const) {
    cards.push(makeJoker(deck, index));
  }
  return cards;
}

/** Builds the full 116-card Five Crowns set (two identical decks). */
export function createDeck(): Card[] {
  return [...createSingleDeck(1), ...createSingleDeck(2)];
}

/**
 * Fisher-Yates shuffle. Pure: returns a new array and never mutates the input.
 * Always executed server side with a CSPRNG.
 */
export function shuffleDeck(cards: Card[], random: RandomSource = secureRandom): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, random);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

export interface DealResult {
  hands: Card[][];
  drawPile: Card[];
  discardPile: Card[];
}

/**
 * Deals `cardsPerPlayer` to each player, then turns one card face up to start
 * the discard pile. Cards are dealt one at a time, round-robin, exactly as at a
 * physical table.
 */
export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number): DealResult {
  if (playerCount <= 0) throw new Error('dealCards: playerCount must be > 0');
  if (cardsPerPlayer <= 0) throw new Error('dealCards: cardsPerPlayer must be > 0');
  const required = playerCount * cardsPerPlayer + 1;
  if (deck.length < required) {
    throw new Error(`dealCards: deck of ${deck.length} cannot serve ${required} cards`);
  }

  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const stock = [...deck];
  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (let player = 0; player < playerCount; player += 1) {
      hands[player].push(stock.shift() as Card);
    }
  }
  const discardPile = [stock.shift() as Card];
  return { hands, drawPile: stock, discardPile };
}

export interface DrawResult {
  card: Card;
  drawPile: Card[];
  discardPile: Card[];
  /** True when the stock ran out and the discard pile was recycled. */
  recycled: boolean;
}

/**
 * Draws the top card of the stock. When the stock is empty the discard pile is
 * turned over (keeping its top card face up) and reshuffled, as the rules
 * require for long rounds.
 */
export function drawCard(
  drawPile: Card[],
  discardPile: Card[],
  random: RandomSource = secureRandom,
): DrawResult {
  if (drawPile.length > 0) {
    const [card, ...rest] = drawPile;
    return { card, drawPile: rest, discardPile, recycled: false };
  }
  if (discardPile.length <= 1) {
    throw new Error('drawCard: no cards left to draw');
  }
  const top = discardPile[discardPile.length - 1];
  const recycled = shuffleDeck(discardPile.slice(0, -1), random);
  const [card, ...rest] = recycled;
  return { card, drawPile: rest, discardPile: [top], recycled: true };
}

/** Takes the single face-up card from the discard pile. */
export function drawDiscard(discardPile: Card[]): { card: Card; discardPile: Card[] } {
  if (discardPile.length === 0) throw new Error('drawDiscard: discard pile is empty');
  const card = discardPile[discardPile.length - 1];
  return { card, discardPile: discardPile.slice(0, -1) };
}

export function topDiscard(discardPile: Card[]): Card | null {
  return discardPile.length ? discardPile[discardPile.length - 1] : null;
}

/** Rebuilds a pristine, unshuffled 116-card set. */
export function resetDeck(): Card[] {
  return createDeck();
}

/** Verifies that a collection of piles together form exactly one complete set. */
export function validateDeckIntegrity(piles: Card[][]): { ok: boolean; reason?: string } {
  const seen = new Set<string>();
  let count = 0;
  for (const pile of piles) {
    for (const card of pile) {
      if (seen.has(card.id)) return { ok: false, reason: `duplicate card ${card.id}` };
      seen.add(card.id);
      count += 1;
    }
  }
  if (count !== FULL_DECK_SIZE) {
    return { ok: false, reason: `expected ${FULL_DECK_SIZE} cards, found ${count}` };
  }
  return { ok: true };
}
