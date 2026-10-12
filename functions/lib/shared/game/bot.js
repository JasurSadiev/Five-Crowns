"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOT_DIFFICULTY_BLURBS = exports.BOT_DIFFICULTY_LABELS = exports.BOT_DIFFICULTIES = void 0;
exports.decideDraw = decideDraw;
exports.decideDiscard = decideDiscard;
exports.playBotTurn = playBotTurn;
const cards_1 = require("./cards");
const combinations_1 = require("./combinations");
const rng_1 = require("./rng");
const deck_1 = require("./deck");
const turns_1 = require("./turns");
exports.BOT_DIFFICULTIES = ['easy', 'normal', 'hard'];
exports.BOT_DIFFICULTY_LABELS = {
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
};
exports.BOT_DIFFICULTY_BLURBS = {
    easy: 'Learns as it goes. Misses melds and hangs on to high cards.',
    normal: 'Plays a sensible game and punishes obvious mistakes.',
    hard: 'Uses the full solver, hunts the discard pile and goes out fast.',
};
/** How often each difficulty deliberately plays a worse move than it found. */
const NOISE = { easy: 0.55, normal: 0.15, hard: 0 };
/** Minimum improvement (in leftover points) needed to take the discard. */
const DISCARD_THRESHOLD = { easy: 8, normal: 3, hard: 1 };
/**
 * How good is this hand? Lower is better: it is the points still stuck in your
 * hand once the best possible melds are laid down.
 */
function leftoverScore(cards, wildRank) {
    if (cards.length === 0)
        return 0;
    const analysis = (0, combinations_1.findValidCombinations)(cards, wildRank);
    return analysis.best?.leftoverScore ?? cards.reduce((t, c) => t + (0, cards_1.cardValue)(c, wildRank), 0);
}
/**
 * Decide whether to take the face-up discard or draw blind from the stock.
 *
 * The bot compares the hand it would hold after taking the discard (and then
 * throwing its worst card) against the hand it has now. Wild cards are always
 * worth taking because they complete anything.
 */
function decideDraw(state, uid, difficulty, random = rng_1.secureRandom) {
    const top = (0, deck_1.topDiscard)(state.discardPile);
    if (!top)
        return 'stock';
    if (state.drawPile.length === 0)
        return 'discard';
    const hand = state.players[uid].hand;
    // A wild or joker is never a bad pickup.
    if ((0, cards_1.isWild)(top, state.wildRank)) {
        return difficulty === 'easy' && random() < 0.3 ? 'stock' : 'discard';
    }
    if (difficulty === 'easy' && random() < NOISE.easy)
        return 'stock';
    const current = leftoverScore(hand, state.wildRank);
    const withCard = [...hand, top];
    // Best achievable after taking it and discarding something.
    const analysis = (0, combinations_1.findValidCombinations)(withCard, state.wildRank);
    const improved = analysis.bestAfterDiscard
        ? analysis.bestAfterDiscard.arrangement.leftoverScore
        : leftoverScore(withCard, state.wildRank);
    const gain = current - improved;
    return gain >= DISCARD_THRESHOLD[difficulty] ? 'discard' : 'stock';
}
/**
 * Pick the card to throw away, and decide whether this is the turn to go out.
 *
 * Going out is never declined by `normal` or `hard`: in Five Crowns the player
 * who goes out is guaranteed zero for the round, so there is no reason to wait.
 */
function decideDiscard(state, uid, difficulty, random = rng_1.secureRandom) {
    const hand = state.players[uid].hand;
    const wildRank = state.wildRank;
    const analysis = (0, combinations_1.findValidCombinations)(hand, wildRank);
    // Can we lay everything down bar one card? Then go out.
    if (analysis.canGoOut && analysis.goOutOptions.length > 0) {
        const takeIt = difficulty === 'easy' ? random() > 0.25 : true;
        if (takeIt) {
            const option = analysis.goOutOptions[0];
            return { cardId: option.discard.id, goOut: true, melds: option.melds };
        }
    }
    const naive = highestCard(hand, wildRank);
    if (difficulty === 'easy') {
        // Throws the biggest card, which often breaks up its own melds.
        return { cardId: naive.id, goOut: false };
    }
    if (random() < NOISE[difficulty])
        return { cardId: naive.id, goOut: false };
    const bestAfterDiscard = analysis.bestAfterDiscard;
    if (!bestAfterDiscard)
        return { cardId: naive.id, goOut: false };
    if (difficulty === 'hard') {
        // Among equally good discards prefer the one least useful to opponents:
        // never hand over a wild, and prefer a rank already seen in the discards.
        const safest = safestEquivalentDiscard(state, uid, bestAfterDiscard.arrangement.leftoverScore, wildRank);
        if (safest)
            return { cardId: safest.id, goOut: false };
    }
    return { cardId: bestAfterDiscard.discard.id, goOut: false };
}
/** Highest-value card, preferring to keep wilds. */
function highestCard(hand, wildRank) {
    const sorted = [...hand].sort((a, b) => {
        const aw = (0, cards_1.isWild)(a, wildRank) ? 1 : 0;
        const bw = (0, cards_1.isWild)(b, wildRank) ? 1 : 0;
        if (aw !== bw)
            return aw - bw; // non-wilds first
        return (0, cards_1.cardValue)(b, wildRank) - (0, cards_1.cardValue)(a, wildRank);
    });
    return sorted[0];
}
/**
 * Of all discards that leave the hand equally strong, pick the least helpful
 * to the next player. Only `hard` bothers with this.
 */
function safestEquivalentDiscard(state, uid, targetScore, wildRank) {
    const hand = state.players[uid].hand;
    const seenRanks = new Set(state.discardPile.map((c) => c.rank));
    let bestCard = null;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const card of hand) {
        if ((0, cards_1.isWild)(card, wildRank))
            continue; // never feed a wild
        const remaining = hand.filter((c) => c.id !== card.id);
        if (leftoverScore(remaining, wildRank) > targetScore)
            continue;
        // Lower penalty = safer. A rank already discarded is less likely to be
        // collected; a high card hurts the opponent more if they are stuck with it.
        const penalty = (seenRanks.has(card.rank) ? 0 : 2) - (0, cards_1.cardValue)(card, wildRank) / 10;
        if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestCard = card;
        }
    }
    return bestCard;
}
/**
 * Play one complete bot turn: draw, then discard (going out when possible).
 *
 * Returns the standard engine result, so a failure is handled exactly like a
 * rejected human move rather than crashing the round.
 */
function playBotTurn(state, uid, difficulty, random = rng_1.secureRandom) {
    let working = state;
    if (working.turnPhase === 'draw') {
        const choice = decideDraw(working, uid, difficulty, random);
        const drawn = choice === 'discard' ? (0, turns_1.takeDiscard)(working, uid) : (0, turns_1.drawFromStock)(working, uid, random);
        if (!drawn.ok) {
            // Fall back to the other pile before giving up.
            const fallback = choice === 'discard' ? (0, turns_1.drawFromStock)(working, uid, random) : (0, turns_1.takeDiscard)(working, uid);
            if (!fallback.ok)
                return fallback;
            working = fallback.state;
        }
        else {
            working = drawn.state;
        }
    }
    const { cardId, goOut, melds } = decideDiscard(working, uid, difficulty, random);
    const result = (0, turns_1.discard)(working, uid, cardId, { goOut, melds });
    // If the chosen go-out was somehow rejected, discard without going out
    // rather than stalling the table.
    if (!result.ok && goOut)
        return (0, turns_1.discard)(working, uid, cardId, { goOut: false });
    return result;
}
//# sourceMappingURL=bot.js.map