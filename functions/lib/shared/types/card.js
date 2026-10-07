"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ENGINE_OPTIONS = exports.MAX_RANK = exports.MIN_RANK = exports.RANKS = exports.SUITS = void 0;
exports.SUITS = ['stars', 'hearts', 'clubs', 'spades', 'diamonds'];
/** Rank values. 11 = Jack, 12 = Queen, 13 = King. There are no 2s or Aces. */
exports.RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
exports.MIN_RANK = 3;
exports.MAX_RANK = 13;
exports.DEFAULT_ENGINE_OPTIONS = {
    allowAllWildMelds: true,
};
//# sourceMappingURL=card.js.map