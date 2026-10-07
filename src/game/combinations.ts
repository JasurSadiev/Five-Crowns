import {
  DEFAULT_ENGINE_OPTIONS,
  type Card,
  type EngineOptions,
  type Meld,
  type Rank,
} from '../types/card';
import { cardValue, isWild } from './cards';
import { MIN_MELD_SIZE, validateBook } from './books';
import { validateRun } from './runs';

/**
 * ---------------------------------------------------------------------------
 * The Five Crowns combination solver
 * ---------------------------------------------------------------------------
 *
 * Given a hand and the round's wild rank, we need to answer two questions
 * exactly (never heuristically):
 *
 *   1. "Can this hand be arranged into books/runs with exactly one card left
 *      to discard?"  -> the player may go out.
 *   2. "What is the lowest possible score for the cards I cannot meld?"
 *      -> used for scoring at the end of a round.
 *
 * Both are solved with the same exact dynamic program over subsets:
 *
 *   dp[mask] = minimum penalty of the cards in `mask`
 *            = min( value(lowest) + dp[mask without lowest],
 *                   min over valid melds M ⊆ mask containing `lowest` of
 *                      dp[mask \ M] )
 *
 * Because every card is worth at least 3 points, `dp[mask] === 0` is exactly
 * equivalent to "the cards in `mask` can be partitioned into valid melds".
 *
 * Complexity: enumerating candidate melds is O(2^n * n); the DP visits each of
 * the 2^n masks once and only iterates over the melds whose lowest card is the
 * mask's lowest card. For a 14 card hand (round 11 after drawing) this runs in
 * single-digit milliseconds.
 */

export interface Arrangement {
  melds: Meld[];
  leftover: Card[];
  leftoverScore: number;
}

export interface GoOutOption {
  discard: Card;
  melds: Meld[];
}

export interface CombinationAnalysis {
  /** True when some card can be discarded leaving a fully melded hand. */
  canGoOut: boolean;
  /** Every discard that allows the player to go out, with its melds. */
  goOutOptions: GoOutOption[];
  /** Lowest-penalty arrangement of the whole hand (nothing discarded). */
  best: Arrangement;
  /** Lowest-penalty arrangement when exactly one card may be discarded. */
  bestAfterDiscard: { discard: Card; arrangement: Arrangement } | null;
  /** Maximal valid melds available in the hand, for the optional hint tool. */
  candidateMelds: Meld[];
  /** Two-card groups that become a meld with one more card. */
  nearMisses: Array<{ cards: Card[]; needs: string }>;
}

/** Hard safety limit; real hands never exceed 14 cards. */
const MAX_SOLVER_CARDS = 20;

interface SolverModel {
  cards: Card[];
  values: number[];
  meldMasks: number[];
  meldByMask: Map<number, Meld>;
  meldsByLowest: number[][];
}

function lowestBit(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}

function buildModel(hand: Card[], wildRank: Rank, options: EngineOptions): SolverModel {
  const cards = [...hand];
  const n = cards.length;
  const values = cards.map((card) => cardValue(card, wildRank));
  const meldMasks: number[] = [];
  const meldByMask = new Map<number, Meld>();
  const meldsByLowest: number[][] = Array.from({ length: n }, () => []);

  const total = 1 << n;
  const subset: Card[] = [];
  for (let mask = 1; mask < total; mask += 1) {
    const size = popcount(mask);
    if (size < MIN_MELD_SIZE) continue;
    subset.length = 0;
    for (let i = 0; i < n; i += 1) {
      if (mask & (1 << i)) subset.push(cards[i]);
    }
    const book = validateBook(subset, wildRank, options);
    let meld: Meld | undefined = book.valid ? book.meld : undefined;
    if (!meld) {
      const run = validateRun(subset, wildRank, options);
      if (run.valid) meld = run.meld;
    }
    if (!meld) continue;
    meldMasks.push(mask);
    meldByMask.set(mask, meld);
    meldsByLowest[lowestBit(mask)].push(mask);
  }

  return { cards, values, meldMasks, meldByMask, meldsByLowest };
}

function popcount(mask: number): number {
  let x = mask;
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

interface SolvedTable {
  model: SolverModel;
  dp: Int32Array;
  /** 0 = drop lowest card, otherwise the meld mask that was used. */
  choice: Int32Array;
}

function solve(model: SolverModel): SolvedTable {
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
      if ((meldMask & mask) !== meldMask) continue;
      const candidate = dp[mask & ~meldMask];
      if (candidate < best) {
        best = candidate;
        bestChoice = meldMask;
        if (best === 0) break;
      }
    }
    dp[mask] = best;
    choice[mask] = bestChoice;
  }

  return { model, dp, choice };
}

function reconstruct(table: SolvedTable, startMask: number): Arrangement {
  const { model, dp, choice } = table;
  const melds: Meld[] = [];
  const leftover: Card[] = [];
  let mask = startMask;
  while (mask !== 0) {
    const used = choice[mask];
    if (used === 0) {
      const low = lowestBit(mask);
      leftover.push(model.cards[low]);
      mask &= ~(1 << low);
    } else {
      const meld = model.meldByMask.get(used);
      if (meld) melds.push(meld);
      mask &= ~used;
    }
  }
  return { melds, leftover, leftoverScore: dp[startMask] };
}

/* ------------------------------------------------------------------------ */
/* Memoisation - the UI calls the solver on every hand change.               */
/* ------------------------------------------------------------------------ */

const CACHE_LIMIT = 48;
const cache = new Map<string, CombinationAnalysis>();

function cacheKey(hand: Card[], wildRank: Rank, options: EngineOptions): string {
  const ids = hand.map((card) => card.id).sort().join(',');
  return `${wildRank}|${options.allowAllWildMelds ? 1 : 0}|${ids}`;
}

function remember(key: string, value: CombinationAnalysis): CombinationAnalysis {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
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
export function findValidCombinations(
  hand: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): CombinationAnalysis {
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
  if (cached) return cached;

  const model = buildModel(hand, wildRank, options);
  const table = solve(model);
  const n = hand.length;
  const full = (1 << n) - 1;

  const best = reconstruct(table, full);

  const goOutOptions: GoOutOption[] = [];
  let bestAfterDiscard: { discard: Card; arrangement: Arrangement } | null = null;

  // Going out requires at least one meld (3 cards) plus the discard.
  const canConsiderGoingOut = n >= MIN_MELD_SIZE + 1;
  for (let i = 0; i < n; i += 1) {
    const remaining = full & ~(1 << i);
    const penalty = table.dp[remaining];
    const arrangement = reconstruct(table, remaining);
    if (
      bestAfterDiscard === null ||
      penalty < bestAfterDiscard.arrangement.leftoverScore ||
      (penalty === bestAfterDiscard.arrangement.leftoverScore &&
        cardValue(model.cards[i], wildRank) >
          cardValue(bestAfterDiscard.discard, wildRank))
    ) {
      bestAfterDiscard = { discard: model.cards[i], arrangement };
    }
    if (canConsiderGoingOut && penalty === 0) {
      goOutOptions.push({ discard: model.cards[i], melds: arrangement.melds });
    }
  }

  const candidateMelds = maximalMelds(model);
  const nearMisses = findNearMisses(hand, wildRank, model);

  const analysis: CombinationAnalysis = {
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
export function bestArrangement(
  hand: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): Arrangement {
  return findValidCombinations(hand, wildRank, options).best;
}

/** True when the hand can be fully melded after discarding exactly one card. */
export function canGoOut(
  hand: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): boolean {
  return findValidCombinations(hand, wildRank, options).canGoOut;
}

/** True when every card in `cards` can be partitioned into valid melds. */
export function canMeldAll(
  cards: Card[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): boolean {
  if (cards.length === 0) return true;
  if (cards.length < MIN_MELD_SIZE) return false;
  return bestArrangement(cards, wildRank, options).leftoverScore === 0;
}

/**
 * Validates a player-submitted arrangement: every meld must be legal, may only
 * use cards the player actually holds, and no card may be used twice.
 */
export function validateArrangement(
  hand: Card[],
  melds: Meld[],
  wildRank: Rank,
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): { valid: boolean; reason?: string; melds: Meld[]; leftover: Card[]; leftoverScore: number } {
  const byId = new Map(hand.map((card) => [card.id, card]));
  const used = new Set<string>();
  const normalised: Meld[] = [];

  for (const meld of melds) {
    const cards: Card[] = [];
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
    const book = validateBook(cards, wildRank, options);
    const run = book.valid ? null : validateRun(cards, wildRank, options);
    const winner = book.valid ? book.meld : run?.valid ? run.meld : null;
    if (!winner) {
      return { valid: false, reason: 'invalid_meld', melds: [], leftover: hand, leftoverScore: 0 };
    }
    normalised.push(winner);
  }

  const leftover = hand.filter((card) => !used.has(card.id));
  const leftoverScore = leftover.reduce((sum, card) => sum + cardValue(card, wildRank), 0);
  return { valid: true, melds: normalised, leftover, leftoverScore };
}

/** Candidate melds that are not contained inside a larger valid meld. */
function maximalMelds(model: SolverModel): Meld[] {
  const masks = model.meldMasks;
  const result: Meld[] = [];
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
      if (meld) result.push(meld);
    }
  }
  result.sort((a, b) => b.cards.length - a.cards.length);
  return result.slice(0, 24);
}

/** Pairs that would become a meld with exactly one extra card. */
function findNearMisses(
  hand: Card[],
  wildRank: Rank,
  model: SolverModel,
): Array<{ cards: Card[]; needs: string }> {
  const naturals = hand.filter((card) => !isWild(card, wildRank));
  const results: Array<{ cards: Card[]; needs: string }> = [];
  const seen = new Set<string>();

  const covered = new Set<string>();
  for (const mask of model.meldMasks) {
    for (let i = 0; i < model.cards.length; i += 1) {
      if (mask & (1 << i)) covered.add(model.cards[i].id);
    }
  }

  for (let i = 0; i < naturals.length; i += 1) {
    for (let j = i + 1; j < naturals.length; j += 1) {
      const a = naturals[i];
      const b = naturals[j];
      if (covered.has(a.id) && covered.has(b.id)) continue;
      let needs: string | null = null;
      if (a.rank === b.rank) {
        needs = `another ${a.rank} or a wild`;
      } else if (a.suit === b.suit) {
        const diff = Math.abs((a.rank as number) - (b.rank as number));
        if (diff === 1) needs = `a neighbouring ${a.suit} card or a wild`;
        else if (diff === 2) needs = `the missing ${a.suit} card or a wild`;
      }
      if (!needs) continue;
      const key = [a.id, b.id].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ cards: [a, b], needs });
    }
  }
  return results.slice(0, 8);
}

/** Clears the memoisation cache (tests only). */
export function __clearCombinationCache(): void {
  cache.clear();
}
