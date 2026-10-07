"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FULL_DECK_SIZE = exports.JOKERS_PER_DECK = exports.CARDS_PER_DECK = void 0;
exports.createSingleDeck = createSingleDeck;
exports.createDeck = createDeck;
exports.shuffleDeck = shuffleDeck;
exports.dealCards = dealCards;
exports.drawCard = drawCard;
exports.drawDiscard = drawDiscard;
exports.topDiscard = topDiscard;
exports.resetDeck = resetDeck;
exports.validateDeckIntegrity = validateDeckIntegrity;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
const rng_1 = require("./rng");
exports.CARDS_PER_DECK = 58;
exports.JOKERS_PER_DECK = 3;
exports.FULL_DECK_SIZE = exports.CARDS_PER_DECK * 2; // 116
/** Builds one 58-card Five Crowns deck (55 suited cards + 3 jokers). */
function createSingleDeck(deck) {
    const cards = [];
    for (const suit of card_1.SUITS) {
        for (const rank of card_1.RANKS) {
            cards.push((0, cards_1.makeCard)(deck, suit, rank));
        }
    }
    for (const index of [1, 2, 3]) {
        cards.push((0, cards_1.makeJoker)(deck, index));
    }
    return cards;
}
/** Builds the full 116-card Five Crowns set (two identical decks). */
function createDeck() {
    return [...createSingleDeck(1), ...createSingleDeck(2)];
}
/**
 * Fisher-Yates shuffle. Pure: returns a new array and never mutates the input.
 * Always executed server side with a CSPRNG.
 */
function shuffleDeck(cards, random = rng_1.secureRandom) {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = (0, rng_1.randomInt)(i + 1, random);
        const tmp = result[i];
        result[i] = result[j];
        result[j] = tmp;
    }
    return result;
}
/**
 * Deals `cardsPerPlayer` to each player, then turns one card face up to start
 * the discard pile. Cards are dealt one at a time, round-robin, exactly as at a
 * physical table.
 */
function dealCards(deck, playerCount, cardsPerPlayer) {
    if (playerCount <= 0)
        throw new Error('dealCards: playerCount must be > 0');
    if (cardsPerPlayer <= 0)
        throw new Error('dealCards: cardsPerPlayer must be > 0');
    const required = playerCount * cardsPerPlayer + 1;
    if (deck.length < required) {
        throw new Error(`dealCards: deck of ${deck.length} cannot serve ${required} cards`);
    }
    const hands = Array.from({ length: playerCount }, () => []);
    const stock = [...deck];
    for (let round = 0; round < cardsPerPlayer; round += 1) {
        for (let player = 0; player < playerCount; player += 1) {
            hands[player].push(stock.shift());
        }
    }
    const discardPile = [stock.shift()];
    return { hands, drawPile: stock, discardPile };
}
/**
 * Draws the top card of the stock. When the stock is empty the discard pile is
 * turned over (keeping its top card face up) and reshuffled, as the rules
 * require for long rounds.
 */
function drawCard(drawPile, discardPile, random = rng_1.secureRandom) {
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
function drawDiscard(discardPile) {
    if (discardPile.length === 0)
        throw new Error('drawDiscard: discard pile is empty');
    const card = discardPile[discardPile.length - 1];
    return { card, discardPile: discardPile.slice(0, -1) };
}
function topDiscard(discardPile) {
    return discardPile.length ? discardPile[discardPile.length - 1] : null;
}
/** Rebuilds a pristine, unshuffled 116-card set. */
function resetDeck() {
    return createDeck();
}
/** Verifies that a collection of piles together form exactly one complete set. */
function validateDeckIntegrity(piles) {
    const seen = new Set();
    let count = 0;
    for (const pile of piles) {
        for (const card of pile) {
            if (seen.has(card.id))
                return { ok: false, reason: `duplicate card ${card.id}` };
            seen.add(card.id);
            count += 1;
        }
    }
    if (count !== exports.FULL_DECK_SIZE) {
        return { ok: false, reason: `expected ${exports.FULL_DECK_SIZE} cards, found ${count}` };
    }
    return { ok: true };
}
//# sourceMappingURL=deck.js.map