import {
  DEFAULT_ENGINE_OPTIONS,
  MAX_RANK,
  MIN_RANK,
  type Card,
  type EngineOptions,
  type Meld,
  type MeldValidation,
  type Rank,
  type Suit,
} from '../types/card';
import { isWild } from './cards';
import { MIN_MELD_SIZE } from './books';

/** Number of distinct ranks in a suit (3..K) - the longest possible run. */
export const MAX_RUN_LENGTH = MAX_RANK - MIN_RANK + 1; // 11

/**
 * A run is three or more consecutive cards of the SAME suit.
 * Wild cards substitute for any missing card in the sequence and may also
 * extend it at either end, provided the run stays inside 3..K.
 *
 * Valid examples (wild rank = 7):
 *   5h 6h 7h             (7 is wild and fills its own slot)
 *   9c 10c Jc Qc
 *   6h JOKER 8h          (joker stands in for the 7)
 *   JOKER 4s 5s
 */
export function validateRun(
  cards: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): MeldValidation {
  if (cards.length < MIN_MELD_SIZE) {
    return { valid: false, code: 'too_few_cards', reason: 'A run needs at least 3 cards.' };
  }
  if (cards.length > MAX_RUN_LENGTH) {
    return {
      valid: false,
      code: 'cannot_fit_sequence',
      reason: `A run cannot be longer than ${MAX_RUN_LENGTH} cards.`,
    };
  }

  const naturals = cards.filter((card) => !isWild(card, wildRank));
  const wildCount = cards.length - naturals.length;

  if (naturals.length === 0) {
    if (!options.allowAllWildMelds) {
      return {
        valid: false,
        code: 'all_wild_not_allowed',
        reason: 'A meld must contain at least one natural card.',
      };
    }
    return { valid: true, meld: { type: 'run', cards: [...cards] } };
  }

  const suit = naturals[0].suit as Suit;
  if (naturals.some((card) => card.suit !== suit)) {
    return {
      valid: false,
      code: 'mixed_suits',
      reason: 'Every natural card in a run must share the same suit.',
    };
  }

  const ranks = naturals.map((card) => card.rank as Rank).sort((a, b) => a - b);
  for (let i = 1; i < ranks.length; i += 1) {
    if (ranks[i] === ranks[i - 1]) {
      return {
        valid: false,
        code: 'duplicate_rank',
        reason: 'A run cannot contain the same number twice.',
      };
    }
  }

  const lowest = ranks[0];
  const highest = ranks[ranks.length - 1];
  const span = highest - lowest + 1;
  const gaps = span - naturals.length;

  if (gaps > wildCount) {
    return {
      valid: false,
      code: 'not_enough_wilds',
      reason: 'There are not enough wild cards to complete the sequence.',
    };
  }

  const length = cards.length;
  // Wilds not needed for gaps extend the run at either end.
  const lowestPossibleStart = Math.max(MIN_RANK, highest - length + 1);
  const highestPossibleStart = Math.min(lowest, MAX_RANK - length + 1);
  if (lowestPossibleStart > highestPossibleStart) {
    return {
      valid: false,
      code: 'cannot_fit_sequence',
      reason: 'The run does not fit between 3 and K.',
    };
  }

  return {
    valid: true,
    meld: {
      type: 'run',
      cards: [...cards],
      suit,
      startRank: highestPossibleStart as Rank,
    },
  };
}

export function isRun(
  cards: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): boolean {
  return validateRun(cards, wildRank, options).valid;
}

/** Groups a hand by suit - used by the hint engine. */
export function groupBySuit(cards: Card[], wildRank: Rank): Map<Suit, Card[]> {
  const groups = new Map<Suit, Card[]>();
  for (const card of cards) {
    if (isWild(card, wildRank) || card.suit === 'joker') continue;
    const list = groups.get(card.suit) ?? [];
    list.push(card);
    groups.set(card.suit, list);
  }
  return groups;
}

export function describeRun(meld: Meld): string {
  return meld.suit ? `Run in ${meld.suit}` : 'Wild run';
}
