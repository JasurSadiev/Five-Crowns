"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findValidCombinations = findValidCombinations;
exports.bestArrangement = bestArrangement;
exports.canGoOut = canGoOut;
exports.canMeldAll = canMeldAll;
exports.validateArrangement = validateArrangement;
exports.__clearCombinationCache = __clearCombinationCache;
const card_1 = require("../types/card");
const cards_1 = require("./cards");
const books_1 = require("./books");
const runs_1 = require("./runs");
/** Hard safety limit; real hands never exceed 14 cards. */
const MAX_SOLVER_CARDS = 20;
function lowestBit(mask) {
    return 31 - Math.clz32(mask & -mask);
}
function buildModel(hand, wildRank, options) {
    const cards = [...hand];
    const n = cards.length;
    const values = cards.map((card) => (0, cards_1.cardValue)(card, wildRank));
    const meldMasks = [];
    const meldByMask = new Map();
    const meldsByLowest = Array.from({ length: n }, () => []);
    const total = 1 << n;
    const subset = [];
    for (let mask = 1; mask < total; mask += 1) {
        const size = popcount(mask);
        if (size < books_1.MIN_MELD_SIZE)
            continue;
        subset.length = 0;
        for (let i = 0; i < n; i += 1) {
            if (mask & (1 << i))
                subset.push(cards[i]);
        }
        const book = (0, books_1.validateBook)(subset, wildRank, options);
        let meld = book.valid ? book.meld : undefined;
        if (!meld) {
            const run = (0, runs_1.validateRun)(subset, wildRank, options);
            if (run.valid)
                meld = run.meld;
        }
        if (!meld)
            continue;
        meldMasks.push(mask);
        meldByMask.set(mask, meld);
        meldsByLowest[lowestBit(mask)].push(mask);
    }
    return { cards, values, meldMasks, meldByMask, meldsByLowest };
}
function popcount(mask) {
    let x = mask;
    x -= (x >> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
    x = (x + (x >> 4)) & 0x0f0f0f0f;
    return (x * 0x01010101) >> 24;
}
function solve(model) {
    const n = model.cards.length;
    const total = 1 << n;
    const dp = new Int32Array(total);
    const choice = new Int32Array(total);
    for (let mask = 1; mask < total; mask += 1) {
        const low = lowestBit(mask);
        const withoutLow = mask & ~(1 << low);
        let best = model.values[low] + dp[withoutLow];
        let bestChoice = 0;
        const melds = model.meldsByLowest[low];
        for (let k = 0; k < melds.length; k += 1) {
            const meldMask = melds[k];
            if ((meldMask & mask) !== meldMask)
                continue;
            const candidate = dp[mask & ~meldMask];
            if (candidate < best) {
                best = candidate;
                bestChoice = meldMask;
                if (best === 0)
                    break;
            }
        }
        dp[mask] = best;
        choice[mask] = bestChoice;
    }
    return { model, dp, choice };
}
function reconstruct(table, startMask) {
    const { model, dp, choice } = table;
    const melds = [];
    const leftover = [];
    let mask = startMask;
    while (mask !== 0) {
        const used = choice[mask];
        if (used === 0) {
            const low = lowestBit(mask);
            leftover.push(model.cards[low]);
            mask &= ~(1 << low);
        }
        else {
            const meld = model.meldByMask.get(used);
            if (meld)
                melds.push(meld);
            mask &= ~used;
        }
    }
    return { melds, leftover, leftoverScore: dp[startMask] };
}
/* ------------------------------------------------------------------------ */
/* Memoisation - the UI calls the solver on every hand change.               */
/* ------------------------------------------------------------------------ */
const CACHE_LIMIT = 48;
const cache = new Map();
function cacheKey(hand, wildRank, options) {
    const ids = hand.map((card) => card.id).sort().join(',');
    return `${wildRank}|${options.allowAllWildMelds ? 1 : 0}|${ids}`;
}
function remember(key, value) {
    cache.set(key, value);
    if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined)
            cache.delete(oldest);
    }
    return value;
}
/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */
/**
 * Full analysis of a hand. This is the single entry point used by the UI
 * (hints, "go out" button state) and by the server (authoritative validation).
 */
function findValidCombinations(hand, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    if (hand.length === 0) {
        return {
            canGoOut: false,
            goOutOptions: [],
            best: { melds: [], leftover: [], leftoverScore: 0 },
            bestAfterDiscard: null,
            candidateMelds: [],
            nearMisses: [],
        };
    }
    if (hand.length > MAX_SOLVER_CARDS) {
        throw new Error(`findValidCombinations: hand of ${hand.length} cards is unsupported`);
    }
    const key = cacheKey(hand, wildRank, options);
    const cached = cache.get(key);
    if (cached)
        return cached;
    const model = buildModel(hand, wildRank, options);
    const table = solve(model);
    const n = hand.length;
    const full = (1 << n) - 1;
    const best = reconstruct(table, full);
    const goOutOptions = [];
    let bestAfterDiscard = null;
    // Going out requires at least one meld (3 cards) plus the discard.
    const canConsiderGoingOut = n >= books_1.MIN_MELD_SIZE + 1;
    for (let i = 0; i < n; i += 1) {
        const remaining = full & ~(1 << i);
        const penalty = table.dp[remaining];
        const arrangement = reconstruct(table, remaining);
        if (bestAfterDiscard === null ||
            penalty < bestAfterDiscard.arrangement.leftoverScore ||
            (penalty === bestAfterDiscard.arrangement.leftoverScore &&
                (0, cards_1.cardValue)(model.cards[i], wildRank) >
                    (0, cards_1.cardValue)(bestAfterDiscard.discard, wildRank))) {
            bestAfterDiscard = { discard: model.cards[i], arrangement };
        }
        if (canConsiderGoingOut && penalty === 0) {
            goOutOptions.push({ discard: model.cards[i], melds: arrangement.melds });
        }
    }
    const candidateMelds = maximalMelds(model);
    const nearMisses = findNearMisses(hand, wildRank, model);
    const analysis = {
        canGoOut: goOutOptions.length > 0,
        goOutOptions,
        best,
        bestAfterDiscard,
        candidateMelds,
        nearMisses,
    };
    return remember(key, analysis);
}
/** Lowest possible penalty arrangement for a hand (used for round scoring). */
function bestArrangement(hand, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    return findValidCombinations(hand, wildRank, options).best;
}
/** True when the hand can be fully melded after discarding exactly one card. */
function canGoOut(hand, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    return findValidCombinations(hand, wildRank, options).canGoOut;
}
/** True when every card in `cards` can be partitioned into valid melds. */
function canMeldAll(cards, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    if (cards.length === 0)
        return true;
    if (cards.length < books_1.MIN_MELD_SIZE)
        return false;
    return bestArrangement(cards, wildRank, options).leftoverScore === 0;
}
/**
 * Validates a player-submitted arrangement: every meld must be legal, may only
 * use cards the player actually holds, and no card may be used twice.
 */
function validateArrangement(hand, melds, wildRank, options = card_1.DEFAULT_ENGINE_OPTIONS) {
    const byId = new Map(hand.map((card) => [card.id, card]));
    const used = new Set();
    const normalised = [];
    for (const meld of melds) {
        const cards = [];
        for (const card of meld.cards ?? []) {
            const real = byId.get(card.id);
            if (!real) {
                return { valid: false, reason: 'unknown_card', melds: [], leftover: hand, leftoverScore: 0 };
            }
            if (used.has(real.id)) {
                return {
                    valid: false,
                    reason: 'duplicate_card',
                    melds: [],
                    leftover: hand,
                    leftoverScore: 0,
                };
            }
            used.add(real.id);
            cards.push(real);
        }
        const book = (0, books_1.validateBook)(cards, wildRank, options);
        const run = book.valid ? null : (0, runs_1.validateRun)(cards, wildRank, options);
        const winner = book.valid ? book.meld : run?.valid ? run.meld : null;
        if (!winner) {
            return { valid: false, reason: 'invalid_meld', melds: [], leftover: hand, leftoverScore: 0 };
        }
        normalised.push(winner);
    }
    const leftover = hand.filter((card) => !used.has(card.id));
    const leftoverScore = leftover.reduce((sum, card) => sum + (0, cards_1.cardValue)(card, wildRank), 0);
    return { valid: true, melds: normalised, leftover, leftoverScore };
}
/** Candidate melds that are not contained inside a larger valid meld. */
function maximalMelds(model) {
    const masks = model.meldMasks;
    const result = [];
    for (const mask of masks) {
        let maximal = true;
        for (const other of masks) {
            if (other !== mask && (other & mask) === mask) {
                maximal = false;
                break;
            }
        }
        if (maximal) {
            const meld = model.meldByMask.get(mask);
            if (meld)
                result.push(meld);
        }
    }
    result.sort((a, b) => b.cards.length - a.cards.length);
    return result.slice(0, 24);
}
/** Pairs that would become a meld with exactly one extra card. */
function findNearMisses(hand, wildRank, model) {
    const naturals = hand.filter((card) => !(0, cards_1.isWild)(card, wildRank));
    const results = [];
    const seen = new Set();
    const covered = new Set();
    for (const mask of model.meldMasks) {
        for (let i = 0; i < model.cards.length; i += 1) {
            if (mask & (1 << i))
                covered.add(model.cards[i].id);
        }
    }
    for (let i = 0; i < naturals.length; i += 1) {
        for (let j = i + 1; j < naturals.length; j += 1) {
            const a = naturals[i];
            const b = naturals[j];
            if (covered.has(a.id) && covered.has(b.id))
                continue;
            let needs = null;
            if (a.rank === b.rank) {
                needs = `another ${a.rank} or a wild`;
            }
            else if (a.suit === b.suit) {
                const diff = Math.abs(a.rank - b.rank);
                if (diff === 1)
                    needs = `a neighbouring ${a.suit} card or a wild`;
                else if (diff === 2)
                    needs = `the missing ${a.suit} card or a wild`;
            }
            if (!needs)
                continue;
            const key = [a.id, b.id].join('|');
            if (seen.has(key))
                continue;
            seen.add(key);
            results.push({ cards: [a, b], needs });
        }
    }
    return results.slice(0, 8);
}
/** Clears the memoisation cache (tests only). */
function __clearCombinationCache() {
    cache.clear();
}
//# sourceMappingURL=combinations.js.map