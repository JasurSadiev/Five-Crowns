import type { Card, DeckNumber, Rank, Suit } from '../../types/card';
import { makeCard, makeJoker } from '../cards';

const SUIT_BY_LETTER: Record<string, Suit> = {
  t: 'stars',
  h: 'hearts',
  c: 'clubs',
  s: 'spades',
  d: 'diamonds',
};

const RANK_BY_LABEL: Record<string, Rank> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

/**
 * Compact card notation for tests.
 *   `8h`  -> eight of hearts (deck 1)
 *   `10c` -> ten of clubs
 *   `Qt`  -> queen of stars
 *   `W1`  -> the first joker
 */
export function card(spec: string, deck: DeckNumber = 1): Card {
  const jokerMatch = /^W([123])$/.exec(spec);
  if (jokerMatch) return makeJoker(deck, Number(jokerMatch[1]) as 1 | 2 | 3);
  const match = /^(10|[3-9]|[JQK])([thcsd])$/.exec(spec);
  if (!match) throw new Error(`Bad card spec: ${spec}`);
  return makeCard(deck, SUIT_BY_LETTER[match[2]], RANK_BY_LABEL[match[1]]);
}

/** Builds a hand from a space separated list; repeats automatically use deck 2. */
export function hand(specs: string): Card[] {
  const seen = new Map<string, number>();
  return specs
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((spec) => {
      const count = (seen.get(spec) ?? 0) + 1;
      seen.set(spec, count);
      if (count > 2) throw new Error(`Only two copies of ${spec} exist`);
      return card(spec, count as DeckNumber);
    });
}

export const ids = (cards: Card[]): string[] => cards.map((c) => c.id);
