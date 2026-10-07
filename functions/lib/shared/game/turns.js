"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentPlayerId = currentPlayerId;
exports.startRound = startRound;
exports.drawFromStock = drawFromStock;
exports.takeDiscard = takeDiscard;
exports.discard = discard;
exports.finishRound = finishRound;
exports.autoPlayTurn = autoPlayTurn;
exports.toPublicView = toPublicView;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
const deck_1 = require("./deck");
const rules_1 = require("./rules");
const combinations_1 = require("./combinations");
const scoring_1 = require("./scoring");
const rng_1 = require("./rng");
function fail(code, message) {
    return { ok: false, code, message };
}
function clone(state) {
    const players = {};
    for (const [uid, player] of Object.entries(state.players)) {
        players[uid] = {
            ...player,
            hand: [...player.hand],
            melds: player.melds.map((meld) => ({ ...meld, cards: [...meld.cards] })),
            leftover: [...player.leftover],
        };
    }
    return {
        ...state,
        drawPile: [...state.drawPile],
        discardPile: [...state.discardPile],
        turnOrder: [...state.turnOrder],
        finalTurnsRemaining: [...state.finalTurnsRemaining],
        players,
    };
}
function currentPlayerId(state) {
    return state.turnOrder[state.currentPlayerIndex] ?? null;
}
/** Shuffles a fresh 116 card set, deals, and turns the first discard face up. */
function startRound(input) {
    const { round, turnOrder, dealerIndex, random = rng_1.secureRandom, override } = input;
    if (turnOrder.length < 1)
        throw new Error('startRound: no players');
    const cardsDealt = override?.cardsDealt ?? (0, rules_1.cardsForRound)(round);
    const wildRank = override?.wildRank ?? (0, rules_1.wildRankForRound)(round);
    const deck = (0, deck_1.shuffleDeck)((0, deck_1.createDeck)(), random);
    const { hands, drawPile, discardPile } = (0, deck_1.dealCards)(deck, turnOrder.length, cardsDealt);
    const players = {};
    turnOrder.forEach((uid, index) => {
        players[uid] = {
            uid,
            hand: hands[index],
            melds: [],
            leftover: [],
            roundScore: null,
            hasGoneOut: false,
            hasTakenFinalTurn: false,
        };
    });
    const state = {
        round,
        wildRank,
        cardsDealt,
        status: 'playing',
        drawPile,
        discardPile,
        turnOrder: [...turnOrder],
        dealerIndex,
        currentPlayerIndex: (0, rules_1.firstPlayerIndex)(dealerIndex, turnOrder.length),
        turnPhase: 'draw',
        players,
        wentOutBy: null,
        finalTurnsRemaining: [],
        actionSeq: 0,
    };
    const events = [
        {
            type: 'round_started',
            actorId: null,
            payload: {
                round,
                wildRank,
                cardsDealt,
                dealerId: turnOrder[dealerIndex],
                firstPlayerId: turnOrder[state.currentPlayerIndex],
                discardTop: (0, deck_1.topDiscard)(discardPile),
            },
        },
    ];
    return { state, events };
}
function requireTurn(state, uid) {
    if (state.status !== 'playing' && state.status !== 'final_turns') {
        return fail('round_not_active', 'This round is already finished.');
    }
    if (!state.players[uid])
        return fail('unknown_player', 'You are not seated in this game.');
    if (currentPlayerId(state) !== uid)
        return fail('not_your_turn', 'It is not your turn.');
    return null;
}
/** Draw the top card of the stock. Recycles the discard pile when needed. */
function drawFromStock(state, uid, random = rng_1.secureRandom) {
    const invalid = requireTurn(state, uid);
    if (invalid)
        return invalid;
    if (state.turnPhase !== 'draw')
        return fail('already_drawn', 'You have already drawn this turn.');
    const next = clone(state);
    if (next.drawPile.length === 0 && next.discardPile.length <= 1) {
        return fail('no_cards_left', 'There are no cards left to draw.');
    }
    const events = [];
    const result = (0, deck_1.drawCard)(next.drawPile, next.discardPile, random);
    if (result.recycled) {
        events.push({ type: 'stock_recycled', actorId: null, payload: {} });
    }
    next.drawPile = result.drawPile;
    next.discardPile = result.discardPile;
    next.players[uid].hand = [...next.players[uid].hand, result.card];
    next.turnPhase = 'discard';
    next.actionSeq += 1;
    events.push({
        type: 'draw_stock',
        actorId: uid,
        payload: { drawPileCount: next.drawPile.length },
    });
    return { ok: true, state: next, events };
}
/** Take the single face-up card from the discard pile. */
function takeDiscard(state, uid) {
    const invalid = requireTurn(state, uid);
    if (invalid)
        return invalid;
    if (state.turnPhase !== 'draw')
        return fail('already_drawn', 'You have already drawn this turn.');
    if (state.discardPile.length === 0) {
        return fail('empty_discard', 'The discard pile is empty.');
    }
    const next = clone(state);
    const { card, discardPile } = (0, deck_1.drawDiscard)(next.discardPile);
    next.discardPile = discardPile;
    next.players[uid].hand = [...next.players[uid].hand, card];
    next.turnPhase = 'discard';
    next.actionSeq += 1;
    return {
        ok: true,
        state: next,
        events: [{ type: 'draw_discard', actorId: uid, payload: { card } }],
    };
}
/**
 * Discard exactly one card and end the turn.
 *
 * When `goOut` is requested the remaining cards must form valid books/runs with
 * nothing left over. After someone goes out every other player takes exactly
 * one final turn and then melds whatever they can.
 */
function discard(state, uid, cardId, options = {}) {
    const engineOptions = options.engineOptions ?? card_1.DEFAULT_ENGINE_OPTIONS;
    const invalid = requireTurn(state, uid);
    if (invalid)
        return invalid;
    if (state.turnPhase !== 'discard') {
        return fail('must_draw_first', 'Draw a card or take the discard before discarding.');
    }
    const player = state.players[uid];
    const card = player.hand.find((entry) => entry.id === cardId);
    if (!card)
        return fail('card_not_in_hand', 'That card is not in your hand.');
    const remaining = player.hand.filter((entry) => entry.id !== cardId);
    const isFinalTurn = state.status === 'final_turns';
    const wantsToGoOut = Boolean(options.goOut) && !isFinalTurn;
    if (wantsToGoOut && !(0, combinations_1.canMeldAll)(remaining, state.wildRank, engineOptions)) {
        return fail('cannot_go_out', 'Your remaining cards do not form valid books and runs.');
    }
    const next = clone(state);
    const nextPlayer = next.players[uid];
    nextPlayer.hand = remaining;
    next.discardPile = [...next.discardPile, card];
    next.turnPhase = 'draw';
    next.actionSeq += 1;
    const events = [
        { type: 'discard', actorId: uid, payload: { card, goOut: wantsToGoOut } },
    ];
    if (wantsToGoOut) {
        const arrangement = resolveArrangement(remaining, options.melds, state.wildRank, engineOptions);
        // The player lays every card on the table - the hand is now empty.
        nextPlayer.melds = arrangement.melds;
        nextPlayer.leftover = [];
        nextPlayer.hand = [];
        nextPlayer.roundScore = 0;
        nextPlayer.hasGoneOut = true;
        nextPlayer.hasTakenFinalTurn = true;
        next.wentOutBy = uid;
        next.status = 'final_turns';
        next.finalTurnsRemaining = next.turnOrder.filter((id) => id !== uid);
        events.push({
            type: 'went_out',
            actorId: uid,
            payload: { melds: arrangement.melds, round: next.round },
        });
    }
    else if (isFinalTurn) {
        const arrangement = resolveArrangement(remaining, options.melds, state.wildRank, engineOptions);
        // Lay down what melds, keep the rest face up as the scoring pile.
        nextPlayer.melds = arrangement.melds;
        nextPlayer.leftover = arrangement.leftover;
        nextPlayer.hand = [];
        nextPlayer.roundScore = arrangement.leftoverScore;
        nextPlayer.hasTakenFinalTurn = true;
        next.finalTurnsRemaining = next.finalTurnsRemaining.filter((id) => id !== uid);
        events.push({
            type: 'final_turn',
            actorId: uid,
            payload: { score: arrangement.leftoverScore, melds: arrangement.melds },
        });
    }
    if (next.status === 'final_turns' && next.finalTurnsRemaining.length === 0) {
        const finished = finishRound(next);
        return { ok: true, state: finished.state, events: [...events, ...finished.events] };
    }
    advanceTurn(next);
    return { ok: true, state: next, events };
}
function resolveArrangement(cards, submitted, wildRank, engineOptions) {
    const optimal = (0, scoring_1.scoreHand)(cards, wildRank, engineOptions);
    if (submitted && submitted.length) {
        const checked = (0, combinations_1.validateArrangement)(cards, submitted, wildRank, engineOptions);
        if (checked.valid && checked.leftoverScore <= optimal.score) {
            return {
                melds: checked.melds,
                leftover: checked.leftover,
                leftoverScore: checked.leftoverScore,
            };
        }
    }
    return { melds: optimal.melds, leftover: optimal.leftover, leftoverScore: optimal.score };
}
function advanceTurn(state) {
    const count = state.turnOrder.length;
    for (let step = 0; step < count; step += 1) {
        state.currentPlayerIndex = (0, rules_1.nextPlayerIndex)(state.currentPlayerIndex, count);
        const uid = state.turnOrder[state.currentPlayerIndex];
        if (state.status !== 'final_turns')
            return;
        if (state.finalTurnsRemaining.includes(uid))
            return;
    }
}
/** Closes the round and scores every hand. Idempotent. */
function finishRound(state) {
    if (state.status === 'complete')
        return { state, events: [] };
    const next = clone(state);
    const roundScores = {};
    for (const uid of next.turnOrder) {
        const player = next.players[uid];
        if (player.roundScore === null) {
            const scored = (0, scoring_1.scoreHand)(player.hand, next.wildRank);
            player.melds = scored.melds;
            player.leftover = scored.leftover;
            player.hand = [];
            player.roundScore = scored.score;
        }
        roundScores[uid] = player.roundScore ?? 0;
    }
    next.status = 'complete';
    next.turnPhase = 'draw';
    next.finalTurnsRemaining = [];
    return {
        state: next,
        events: [
            {
                type: 'round_complete',
                actorId: null,
                payload: { round: next.round, scores: roundScores, wentOutBy: next.wentOutBy },
            },
        ],
    };
}
/**
 * A conservative automatic turn used when a player's clock runs out.
 * It never goes out and never takes the discard: it draws from the stock and
 * throws away the card that is worth the most while being useless to the hand.
 */
function autoPlayTurn(state, uid, random = rng_1.secureRandom) {
    const invalid = requireTurn(state, uid);
    if (invalid)
        return invalid;
    let working = state;
    if (working.turnPhase === 'draw') {
        const drawn = drawFromStock(working, uid, random);
        if (!drawn.ok) {
            // Nothing can be drawn - close the round rather than hanging the game.
            const finished = finishRound(working);
            return { ok: true, state: finished.state, events: finished.events };
        }
        working = drawn.state;
    }
    const hand = working.players[uid].hand;
    const analysis = (0, combinations_1.findValidCombinations)(hand, working.wildRank);
    const discardCandidate = analysis.bestAfterDiscard?.discard ??
        [...hand].sort((a, b) => (0, cards_1.cardValue)(b, working.wildRank) - (0, cards_1.cardValue)(a, working.wildRank))[0];
    return discard(working, uid, discardCandidate.id, { goOut: false });
}
function toPublicView(state) {
    const cardCounts = {};
    for (const [uid, player] of Object.entries(state.players)) {
        cardCounts[uid] = player.hand.length;
    }
    return {
        round: state.round,
        wildRank: state.wildRank,
        status: state.status,
        drawPileCount: state.drawPile.length,
        discardPileCount: state.discardPile.length,
        discardTop: (0, deck_1.topDiscard)(state.discardPile),
        currentPlayerId: currentPlayerId(state),
        turnPhase: state.turnPhase,
        wentOutBy: state.wentOutBy,
        finalTurnsRemaining: [...state.finalTurnsRemaining],
        cardCounts,
    };
}
//# sourceMappingURL=turns.js.map