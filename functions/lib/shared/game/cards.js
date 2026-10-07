"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUIT_LABEL = exports.SUIT_LETTER = exports.SUIT_SYMBOL = exports.WILD_VALUE = exports.JOKER_VALUE = exports.MAX_RANK = exports.MIN_RANK = exports.RANKS = exports.SUITS = void 0;
exports.rankLabel = rankLabel;
exports.rankName = rankName;
exports.rankPlural = rankPlural;
exports.isJoker = isJoker;
exports.isWild = isWild;
exports.cardValue = cardValue;
exports.handValue = handValue;
exports.cardId = cardId;
exports.makeCard = makeCard;
exports.makeJoker = makeJoker;
exports.describeCard = describeCard;
exports.shortCard = shortCard;
exports.parseCardId = parseCardId;
exports.sameCard = sameCard;
exports.sortByRank = sortByRank;
exports.sortBySuit = sortBySuit;
exports.applyOrder = applyOrder;
const card_1 = require("../types/card");
Object.defineProperty(exports, "MAX_RANK", { enumerable: true, get: function () { return card_1.MAX_RANK; } });
Object.defineProperty(exports, "MIN_RANK", { enumerable: true, get: function () { return card_1.MIN_RANK; } });
Object.defineProperty(exports, "RANKS", { enumerable: true, get: function () { return card_1.RANKS; } });
Object.defineProperty(exports, "SUITS", { enumerable: true, get: function () { return card_1.SUITS; } });
exports.JOKER_VALUE = 50;
exports.WILD_VALUE = 20;
exports.SUIT_SYMBOL = {
    stars: '★',
    hearts: '♥',
    clubs: '♣',
    spades: '♠',
    diamonds: '♦',
    joker: '🃏',
};
/** Single letter fallback so suits are identifiable without colour or glyphs. */
exports.SUIT_LETTER = {
    stars: 'T',
    hearts: 'H',
    clubs: 'C',
    spades: 'S',
    diamonds: 'D',
    joker: 'W',
};
exports.SUIT_LABEL = {
    stars: 'Stars',
    hearts: 'Hearts',
    clubs: 'Clubs',
    spades: 'Spades',
    diamonds: 'Diamonds',
    joker: 'Joker',
};
const RANK_LABELS = {
    11: 'J',
    12: 'Q',
    13: 'K',
};
const RANK_NAMES = {
    11: 'Jack',
    12: 'Queen',
    13: 'King',
};
function rankLabel(rank) {
    if (rank === null)
        return 'W';
    return RANK_LABELS[rank] ?? String(rank);
}
function rankName(rank) {
    if (rank === null)
        return 'Joker';
    return RANK_NAMES[rank] ?? String(rank);
}
/** Pluralised rank used for the "7s are wild" banner. */
function rankPlural(rank) {
    const name = RANK_NAMES[rank];
    if (name)
        return `${name}s`;
    return `${rank}s`;
}
function isJoker(card) {
    return card.suit === 'joker';
}
/** Jokers are always wild; every card of the current round's rank is wild too. */
function isWild(card, wildRank) {
    return card.suit === 'joker' || card.rank === wildRank;
}
function cardValue(card, wildRank) {
    if (isJoker(card))
        return exports.JOKER_VALUE;
    if (card.rank === wildRank)
        return exports.WILD_VALUE;
    return card.rank ?? 0;
}
function handValue(cards, wildRank) {
    return cards.reduce((sum, card) => sum + cardValue(card, wildRank), 0);
}
function cardId(deck, suit, rank) {
    return `d${deck}-${suit}-${rank}`;
}
function makeCard(deck, suit, rank) {
    return { id: cardId(deck, suit, rank), suit, rank, deck };
}
function makeJoker(deck, index) {
    return { id: cardId(deck, 'joker', index), suit: 'joker', rank: null, deck };
}
/** Human readable description, e.g. `Queen of Hearts (deck 2)`. */
function describeCard(card) {
    if (isJoker(card))
        return `Joker (deck ${card.deck})`;
    return `${rankName(card.rank)} of ${exports.SUIT_LABEL[card.suit]} (deck ${card.deck})`;
}
/** Short label used in logs and replays, e.g. `Q♥`. */
function shortCard(card) {
    if (isJoker(card))
        return '🃏';
    return `${rankLabel(card.rank)}${exports.SUIT_SYMBOL[card.suit]}`;
}
/** Parses a card id back into a card. Returns null when the id is malformed. */
function parseCardId(id) {
    const match = /^d([12])-(stars|hearts|clubs|spades|diamonds|joker)-(\d+)$/.exec(id);
    if (!match)
        return null;
    const deck = Number(match[1]);
    const suit = match[2];
    const value = Number(match[3]);
    if (suit === 'joker') {
        if (value < 1 || value > 3)
            return null;
        return { id, suit, rank: null, deck };
    }
    if (!card_1.RANKS.includes(value))
        return null;
    return { id, suit, rank: value, deck };
}
function sameCard(a, b) {
    return a.id === b.id;
}
const SUIT_ORDER = {
    stars: 0,
    hearts: 1,
    clubs: 2,
    spades: 3,
    diamonds: 4,
    joker: 5,
};
/** Sort by rank then suit; wild cards and jokers float to the end. */
function sortByRank(cards, wildRank) {
    return [...cards].sort((a, b) => {
        const aw = isWild(a, wildRank) ? 1 : 0;
        const bw = isWild(b, wildRank) ? 1 : 0;
        if (aw !== bw)
            return aw - bw;
        const ar = a.rank ?? 99;
        const br = b.rank ?? 99;
        if (ar !== br)
            return ar - br;
        if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit])
            return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        return a.deck - b.deck;
    });
}
/** Sort by suit then rank; wild cards and jokers float to the end. */
function sortBySuit(cards, wildRank) {
    return [...cards].sort((a, b) => {
        const aw = isWild(a, wildRank) ? 1 : 0;
        const bw = isWild(b, wildRank) ? 1 : 0;
        if (aw !== bw)
            return aw - bw;
        if (SUIT_ORDER[a.suit] !== SUIT_ORDER[b.suit])
            return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
        const ar = a.rank ?? 99;
        const br = b.rank ?? 99;
        if (ar !== br)
            return ar - br;
        return a.deck - b.deck;
    });
}
/** Re-orders `cards` to match the given list of ids, appending unknown cards. */
function applyOrder(cards, order) {
    const byId = new Map(cards.map((card) => [card.id, card]));
    const result = [];
    for (const id of order) {
        const card = byId.get(id);
        if (card) {
            result.push(card);
            byId.delete(id);
        }
    }
    for (const card of byId.values())
        result.push(card);
    return result;
}
//# sourceMappingURL=cards.js.map