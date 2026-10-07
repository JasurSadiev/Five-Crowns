import {
  DEFAULT_ENGINE_OPTIONS,
  type Card,
  type EngineOptions,
  type Meld,
  type MeldValidation,
  type Rank,
} from '../types/card';
import { isWild } from './cards';

export const MIN_MELD_SIZE = 3;

/**
 * A book is three or more cards of the same rank, in any combination of suits.
 * Wild cards (jokers and every card of the round's wild rank) may stand in for
 * any missing card, may be adjacent, and any number of them may appear.
 *
 * Valid examples (wild rank = 7):
 *   8c 8h 8s
 *   8c 8h 8s 8*          (four suits of the same rank)
 *   8c 8h 7d             (7 is wild)
 *   8c JOKER JOKER
 */
export function validateBook(
  cards: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): MeldValidation {
  if (cards.length < MIN_MELD_SIZE) {
    return { valid: false, code: 'too_few_cards', reason: 'A book needs at least 3 cards.' };
  }

  const naturals = cards.filter((card) => !isWild(card, wildRank));

  if (naturals.length === 0) {
    if (!options.allowAllWildMelds) {
      return {
        valid: false,
        code: 'all_wild_not_allowed',
        reason: 'A meld must contain at least one natural card.',
      };
    }
    return {
      valid: true,
      meld: { type: 'book', cards: [...cards] },
    };
  }

  const rank = naturals[0].rank as Rank;
  const mixed = naturals.some((card) => card.rank !== rank);
  if (mixed) {
    return {
      valid: false,
      code: 'mixed_ranks',
      reason: 'Every natural card in a book must share the same number.',
    };
  }

  return {
    valid: true,
    meld: { type: 'book', cards: [...cards], rank },
  };
}

export function isBook(
  cards: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): boolean {
  return validateBook(cards, wildRank, options).valid;
}

/** Groups a hand by natural rank - used by the hint engine. */
export function groupByRank(cards: Card[], wildRank: Rank): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of cards) {
    if (isWild(card, wildRank) || card.rank === null) continue;
    const list = groups.get(card.rank) ?? [];
    list.push(card);
    groups.set(card.rank, list);
  }
  return groups;
}

export function describeBook(meld: Meld): string {
  return meld.rank ? `Book of ${meld.rank}s` : 'Wild book';
}
