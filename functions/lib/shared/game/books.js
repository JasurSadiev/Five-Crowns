"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_MELD_SIZE = void 0;
exports.validateBook = validateBook;
exports.isBook = isBook;
exports.groupByRank = groupByRank;
exports.describeBook = describeBook;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
exports.MIN_MELD_SIZE = 3;
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
function validateBook(cards, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    if (cards.length < exports.MIN_MELD_SIZE) {
        return { valid: false, code: 'too_few_cards', reason: 'A book needs at least 3 cards.' };
    }
    const naturals = cards.filter((card) => !(0, cards_1.isWild)(card, wildRank));
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
    const rank = naturals[0].rank;
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
function isBook(cards, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    return validateBook(cards, wildRank, options).valid;
}
/** Groups a hand by natural rank - used by the hint engine. */
function groupByRank(cards, wildRank) {
    const groups = new Map();
    for (const card of cards) {
        if ((0, cards_1.isWild)(card, wildRank) || card.rank === null)
            continue;
        const list = groups.get(card.rank) ?? [];
        list.push(card);
        groups.set(card.rank, list);
    }
    return groups;
}
function describeBook(meld) {
    return meld.rank ? `Book of ${meld.rank}s` : 'Wild book';
}
//# sourceMappingURL=books.js.map