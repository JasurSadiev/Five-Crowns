/**
 * Computer opponents.
 *
 * This lives in the rules engine rather than in the UI on purpose: it is pure,
 * deterministic given a random source, and runs on the server. Bot turns are
 * applied through exactly the same `drawFromStock` / `takeDiscard` / `discard`
 * functions a human goes through, so a bot cannot make a move a person could
 * not, and cannot see anything it is not entitled to see.
 *
 * Three strengths:
 *   easy   - plays plausibly but misses most opportunities and is noisy.
 *   normal - uses the solver, with occasional human-sized mistakes.
 *   hard   - always takes the solver's best line and avoids feeding the table.
 */
import type { Card, Meld, Rank } from '../types/card';
import type { BotDifficulty } from '../types/game';
import { cardValue, isWild } from './cards';
import { findValidCombinations } from './combinations';
import { secureRandom, type RandomSource } from './rng';
import { topDiscard } from './deck';
import {
  discard,
  drawFromStock,
  takeDiscard,
  type EngineResult,
  type RoundState,
} from './turns';

export type { BotDifficulty };

export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard'];

export const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export const BOT_DIFFICULTY_BLURBS: Record<BotDifficulty, string> = {
  easy: 'Learns as it goes. Misses melds and hangs on to high cards.',
  normal: 'Plays a sensible game and punishes obvious mistakes.',
  hard: 'Uses the full solver, hunts the discard pile and goes out fast.',
};

/** How often each difficulty deliberately plays a worse move than it found. */
const NOISE: Record<BotDifficulty, number> = { easy: 0.55, normal: 0.15, hard: 0 };

/** Minimum improvement (in leftover points) needed to take the discard. */
const DISCARD_THRESHOLD: Record<BotDifficulty, number> = { easy: 8, normal: 3, hard: 1 };

/**
 * How good is this hand? Lower is better: it is the points still stuck in your
 * hand once the best possible melds are laid down.
 */
function leftoverScore(cards: Card[], wildRank: Rank): number {
  if (cards.length === 0) return 0;
  const analysis = findValidCombinations(cards, wildRank);
  return analysis.best?.leftoverScore ?? cards.reduce((t, c) => t + cardValue(c, wildRank), 0);
}

/**
 * Decide whether to take the face-up discard or draw blind from the stock.
 *
 * The bot compares the hand it would hold after taking the discard (and then
 * throwing its worst card) against the hand it has now. Wild cards are always
 * worth taking because they complete anything.
 */
export function decideDraw(
  state: RoundState,
  uid: string,
  difficulty: BotDifficulty,
  random: RandomSource = secureRandom,
): 'stock' | 'discard' {
  const top = topDiscard(state.discardPile);
  if (!top) return 'stock';
  if (state.drawPile.length === 0) return 'discard';

  const hand = state.players[uid].hand;

  // A wild or joker is never a bad pickup.
  if (isWild(top, state.wildRank)) {
    return difficulty === 'easy' && random() < 0.3 ? 'stock' : 'discard';
  }

  if (difficulty === 'easy' && random() < NOISE.easy) return 'stock';

  const current = leftoverScore(hand, state.wildRank);
  const withCard = [...hand, top];

  // Best achievable after taking it and discarding something.
  const analysis = findValidCombinations(withCard, state.wildRank);
  const improved = analysis.bestAfterDiscard
    ? analysis.bestAfterDiscard.arrangement.leftoverScore
    : leftoverScore(withCard, state.wildRank);

  const gain = current - improved;
  return gain >= DISCARD_THRESHOLD[difficulty] ? 'discard' : 'stock';
}

export interface BotDiscardChoice {
  cardId: string;
  goOut: boolean;
  melds?: Meld[];
}

/**
 * Pick the card to throw away, and decide whether this is the turn to go out.
 *
 * Going out is never declined by `normal` or `hard`: in Five Crowns the player
 * who goes out is guaranteed zero for the round, so there is no reason to wait.
 */
export function decideDiscard(
  state: RoundState,
  uid: string,
  difficulty: BotDifficulty,
  random: RandomSource = secureRandom,
): BotDiscardChoice {
  const hand = state.players[uid].hand;
  const wildRank = state.wildRank;
  const analysis = findValidCombinations(hand, wildRank);

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

  if (random() < NOISE[difficulty]) return { cardId: naive.id, goOut: false };

  const bestAfterDiscard = analysis.bestAfterDiscard;
  if (!bestAfterDiscard) return { cardId: naive.id, goOut: false };

  if (difficulty === 'hard') {
    // Among equally good discards prefer the one least useful to opponents:
    // never hand over a wild, and prefer a rank already seen in the discards.
    const safest = safestEquivalentDiscard(
      state,
      uid,
      bestAfterDiscard.arrangement.leftoverScore,
      wildRank,
    );
    if (safest) return { cardId: safest.id, goOut: false };
  }

  return { cardId: bestAfterDiscard.discard.id, goOut: false };
}

/** Highest-value card, preferring to keep wilds. */
function highestCard(hand: Card[], wildRank: Rank): Card {
  const sorted = [...hand].sort((a, b) => {
    const aw = isWild(a, wildRank) ? 1 : 0;
    const bw = isWild(b, wildRank) ? 1 : 0;
    if (aw !== bw) return aw - bw; // non-wilds first
    return cardValue(b, wildRank) - cardValue(a, wildRank);
  });
  return sorted[0];
}

/**
 * Of all discards that leave the hand equally strong, pick the least helpful
 * to the next player. Only `hard` bothers with this.
 */
function safestEquivalentDiscard(
  state: RoundState,
  uid: string,
  targetScore: number,
  wildRank: Rank,
): Card | null {
  const hand = state.players[uid].hand;
  const seenRanks = new Set(state.discardPile.map((c) => c.rank));
  let bestCard: Card | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const card of hand) {
    if (isWild(card, wildRank)) continue; // never feed a wild
    const remaining = hand.filter((c) => c.id !== card.id);
    if (leftoverScore(remaining, wildRank) > targetScore) continue;

    // Lower penalty = safer. A rank already discarded is less likely to be
    // collected; a high card hurts the opponent more if they are stuck with it.
    const penalty = (seenRanks.has(card.rank) ? 0 : 2) - cardValue(card, wildRank) / 10;
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
export function playBotTurn(
  state: RoundState,
  uid: string,
  difficulty: BotDifficulty,
  random: RandomSource = secureRandom,
): EngineResult {
  let working = state;

  if (working.turnPhase === 'draw') {
    const choice = decideDraw(working, uid, difficulty, random);
    const drawn = choice === 'discard' ? takeDiscard(working, uid) : drawFromStock(working, uid, random);
    if (!drawn.ok) {
      // Fall back to the other pile before giving up.
      const fallback =
        choice === 'discard' ? drawFromStock(working, uid, random) : takeDiscard(working, uid);
      if (!fallback.ok) return fallback;
      working = fallback.state;
    } else {
      working = drawn.state;
    }
  }

  const { cardId, goOut, melds } = decideDiscard(working, uid, difficulty, random);
  const result = discard(working, uid, cardId, { goOut, melds });

  // If the chosen go-out was somehow rejected, discard without going out
  // rather than stalling the table.
  if (!result.ok && goOut) return discard(working, uid, cardId, { goOut: false });
  return result;
}
