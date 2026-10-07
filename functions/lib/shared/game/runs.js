"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RUN_LENGTH = void 0;
exports.validateRun = validateRun;
exports.isRun = isRun;
exports.groupBySuit = groupBySuit;
exports.describeRun = describeRun;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
const books_1 = require("./books");
/** Number of distinct ranks in a suit (3..K) - the longest possible run. */
exports.MAX_RUN_LENGTH = card_1.MAX_RANK - card_1.MIN_RANK + 1; // 11
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
function validateRun(cards, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    if (cards.length < books_1.MIN_MELD_SIZE) {
        return { valid: false, code: 'too_few_cards', reason: 'A run needs at least 3 cards.' };
    }
    if (cards.length > exports.MAX_RUN_LENGTH) {
        return {
            valid: false,
            code: 'cannot_fit_sequence',
            reason: `A run cannot be longer than ${exports.MAX_RUN_LENGTH} cards.`,
        };
    }
    const naturals = cards.filter((card) => !(0, cards_1.isWild)(card, wildRank));
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
    const suit = naturals[0].suit;
    if (naturals.some((card) => card.suit !== suit)) {
        return {
            valid: false,
            code: 'mixed_suits',
            reason: 'Every natural card in a run must share the same suit.',
        };
    }
    const ranks = naturals.map((card) => card.rank).sort((a, b) => a - b);
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
    const lowestPossibleStart = Math.max(card_1.MIN_RANK, highest - length + 1);
    const highestPossibleStart = Math.min(lowest, card_1.MAX_RANK - length + 1);
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
            startRank: highestPossibleStart,
        },
    };
}
function isRun(cards, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    return validateRun(cards, wildRank, options).valid;
}
/** Groups a hand by suit - used by the hint engine. */
function groupBySuit(cards, wildRank) {
    const groups = new Map();
    for (const card of cards) {
        if ((0, cards_1.isWild)(card, wildRank) || card.suit === 'joker')
            continue;
        const list = groups.get(card.suit) ?? [];
        list.push(card);
        groups.set(card.suit, list);
    }
    return groups;
}
function describeRun(meld) {
    return meld.suit ? `Run in ${meld.suit}` : 'Wild run';
}
//# sourceMappingURL=runs.js.map