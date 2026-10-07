/**
 * Card primitives for Five Crowns.
 *
 * A Five Crowns set contains TWO identical 58-card decks:
 *   5 suits (stars, hearts, clubs, spades, diamonds) x 11 ranks (3..K) = 55
 *   + 3 jokers
 *   = 58 cards per deck  ->  116 cards in total.
 *
 * Because the two decks are identical, a card can never be identified by
 * "8 of hearts" alone - every physical card carries a unique `id`.
 */

export const SUITS = ['stars', 'hearts', 'clubs', 'spades', 'diamonds'] as const;
export type Suit = (typeof SUITS)[number];

/** Rank values. 11 = Jack, 12 = Queen, 13 = King. There are no 2s or Aces. */
export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Rank = (typeof RANKS)[number];

export const MIN_RANK: Rank = 3;
export const MAX_RANK: Rank = 13;

/** Jokers have the pseudo-suit `joker` and a `null` rank. */
export type CardSuit = Suit | 'joker';

export type DeckNumber = 1 | 2;

export interface Card {
  /** Globally unique identity of one physical card, e.g. `d1-hearts-7`, `d2-joker-3`. */
  id: string;
  suit: CardSuit;
  /** `null` only for jokers. */
  rank: Rank | null;
  deck: DeckNumber;
}

export type MeldType = 'book' | 'run';

export interface Meld {
  type: MeldType;
  cards: Card[];
  /** Books: the rank the book represents. Runs: the suit of the run. */
  rank?: Rank;
  suit?: Suit;
  /** Runs only: the lowest rank of the sequence the meld represents. */
  startRank?: Rank;
}

export interface MeldValidation {
  valid: boolean;
  /** Machine readable reason, useful for tests and for UI copy. */
  code?:
    | 'too_few_cards'
    | 'mixed_ranks'
    | 'mixed_suits'
    | 'duplicate_rank'
    | 'not_enough_wilds'
    | 'cannot_fit_sequence'
    | 'all_wild_not_allowed'
    | 'unknown_card';
  reason?: string;
  meld?: Meld;
}

export interface EngineOptions {
  /**
   * The official FAQ allows a book/run made entirely of wild cards.
   * Kept configurable so house rules can be supported without touching the engine.
   */
  allowAllWildMelds: boolean;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  allowAllWildMelds: true,
};
