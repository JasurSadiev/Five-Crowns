import {
  DEFAULT_ENGINE_OPTIONS,
  type Card,
  type EngineOptions,
  type Meld,
  type Rank,
} from '../types/card';
import type { RoundStatus, TurnPhase } from '../types/game';
import { cardValue } from './cards';
import { dealCards, drawCard, drawDiscard, createDeck, shuffleDeck, topDiscard } from './deck';
import { cardsForRound, firstPlayerIndex, nextPlayerIndex, wildRankForRound } from './rules';
import { canMeldAll, findValidCombinations, validateArrangement } from './combinations';
import { scoreHand } from './scoring';
import { secureRandom, type RandomSource } from './rng';

/**
 * The authoritative round state machine.
 *
 * Every rule lives here - the React UI and the Cloud Functions both call these
 * pure functions, which is what keeps the client and the server in agreement
 * while leaving the server as the only writer.
 */

export interface RoundPlayerState {
  uid: string;
  hand: Card[];
  melds: Meld[];
  leftover: Card[];
  roundScore: number | null;
  hasGoneOut: boolean;
  hasTakenFinalTurn: boolean;
}

export interface RoundState {
  round: number;
  wildRank: Rank;
  cardsDealt: number;
  status: RoundStatus;
  drawPile: Card[];
  discardPile: Card[];
  turnOrder: string[];
  dealerIndex: number;
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  players: Record<string, RoundPlayerState>;
  wentOutBy: string | null;
  finalTurnsRemaining: string[];
  actionSeq: number;
}

export type EngineErrorCode =
  | 'not_your_turn'
  | 'already_drawn'
  | 'must_draw_first'
  | 'card_not_in_hand'
  | 'cannot_go_out'
  | 'round_not_active'
  | 'empty_discard'
  | 'no_cards_left'
  | 'invalid_arrangement'
  | 'unknown_player';

export interface EngineEvent {
  type:
    | 'round_started'
    | 'draw_stock'
    | 'draw_discard'
    | 'discard'
    | 'went_out'
    | 'final_turn'
    | 'round_complete'
    | 'stock_recycled';
  actorId: string | null;
  payload: Record<string, unknown>;
}

export type EngineResult =
  | { ok: true; state: RoundState; events: EngineEvent[] }
  | { ok: false; code: EngineErrorCode; message: string };

function fail(code: EngineErrorCode, message: string): EngineResult {
  return { ok: false, code, message };
}

function clone(state: RoundState): RoundState {
  const players: Record<string, RoundPlayerState> = {};
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

export function currentPlayerId(state: RoundState): string | null {
  return state.turnOrder[state.currentPlayerIndex] ?? null;
}

export interface StartRoundInput {
  round: number;
  turnOrder: string[];
  dealerIndex: number;
  random?: RandomSource;
  /** Tie-break rounds deal 6 cards with 6s wild instead of following the ladder. */
  override?: { cardsDealt: number; wildRank: Rank };
}

/** Shuffles a fresh 116 card set, deals, and turns the first discard face up. */
export function startRound(input: StartRoundInput): { state: RoundState; events: EngineEvent[] } {
  const { round, turnOrder, dealerIndex, random = secureRandom, override } = input;
  if (turnOrder.length < 1) throw new Error('startRound: no players');

  const cardsDealt = override?.cardsDealt ?? cardsForRound(round);
  const wildRank = override?.wildRank ?? wildRankForRound(round);
  const deck = shuffleDeck(createDeck(), random);
  const { hands, drawPile, discardPile } = dealCards(deck, turnOrder.length, cardsDealt);

  const players: Record<string, RoundPlayerState> = {};
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

  const state: RoundState = {
    round,
    wildRank,
    cardsDealt,
    status: 'playing',
    drawPile,
    discardPile,
    turnOrder: [...turnOrder],
    dealerIndex,
    currentPlayerIndex: firstPlayerIndex(dealerIndex, turnOrder.length),
    turnPhase: 'draw',
    players,
    wentOutBy: null,
    finalTurnsRemaining: [],
    actionSeq: 0,
  };

  const events: EngineEvent[] = [
    {
      type: 'round_started',
      actorId: null,
      payload: {
        round,
        wildRank,
        cardsDealt,
        dealerId: turnOrder[dealerIndex],
        firstPlayerId: turnOrder[state.currentPlayerIndex],
        discardTop: topDiscard(discardPile),
      },
    },
  ];

  return { state, events };
}

function requireTurn(state: RoundState, uid: string): EngineResult | null {
  if (state.status !== 'playing' && state.status !== 'final_turns') {
    return fail('round_not_active', 'This round is already finished.');
  }
  if (!state.players[uid]) return fail('unknown_player', 'You are not seated in this game.');
  if (currentPlayerId(state) !== uid) return fail('not_your_turn', 'It is not your turn.');
  return null;
}

/** Draw the top card of the stock. Recycles the discard pile when needed. */
export function drawFromStock(
  state: RoundState,
  uid: string,
  random: RandomSource = secureRandom,
): EngineResult {
  const invalid = requireTurn(state, uid);
  if (invalid) return invalid;
  if (state.turnPhase !== 'draw') return fail('already_drawn', 'You have already drawn this turn.');

  const next = clone(state);
  if (next.drawPile.length === 0 && next.discardPile.length <= 1) {
    return fail('no_cards_left', 'There are no cards left to draw.');
  }

  const events: EngineEvent[] = [];
  const result = drawCard(next.drawPile, next.discardPile, random);
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
export function takeDiscard(state: RoundState, uid: string): EngineResult {
  const invalid = requireTurn(state, uid);
  if (invalid) return invalid;
  if (state.turnPhase !== 'draw') return fail('already_drawn', 'You have already drawn this turn.');
  if (state.discardPile.length === 0) {
    return fail('empty_discard', 'The discard pile is empty.');
  }

  const next = clone(state);
  const { card, discardPile } = drawDiscard(next.discardPile);
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

export interface DiscardOptions {
  goOut?: boolean;
  /** Optional player-chosen arrangement; ignored when it scores worse. */
  melds?: Meld[];
  engineOptions?: EngineOptions;
}

/**
 * Discard exactly one card and end the turn.
 *
 * When `goOut` is requested the remaining cards must form valid books/runs with
 * nothing left over. After someone goes out every other player takes exactly
 * one final turn and then melds whatever they can.
 */
export function discard(
  state: RoundState,
  uid: string,
  cardId: string,
  options: DiscardOptions = {},
): EngineResult {
  const engineOptions = options.engineOptions ?? DEFAULT_ENGINE_OPTIONS;
  const invalid = requireTurn(state, uid);
  if (invalid) return invalid;
  if (state.turnPhase !== 'discard') {
    return fail('must_draw_first', 'Draw a card or take the discard before discarding.');
  }

  const player = state.players[uid];
  const card = player.hand.find((entry) => entry.id === cardId);
  if (!card) return fail('card_not_in_hand', 'That card is not in your hand.');

  const remaining = player.hand.filter((entry) => entry.id !== cardId);
  const isFinalTurn = state.status === 'final_turns';
  const wantsToGoOut = Boolean(options.goOut) && !isFinalTurn;

  if (wantsToGoOut && !canMeldAll(remaining, state.wildRank, engineOptions)) {
    return fail('cannot_go_out', 'Your remaining cards do not form valid books and runs.');
  }

  const next = clone(state);
  const nextPlayer = next.players[uid];
  nextPlayer.hand = remaining;
  next.discardPile = [...next.discardPile, card];
  next.turnPhase = 'draw';
  next.actionSeq += 1;

  const events: EngineEvent[] = [
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
  } else if (isFinalTurn) {
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

function resolveArrangement(
  cards: Card[],
  submitted: Meld[] | undefined,
  wildRank: Rank,
  engineOptions: EngineOptions,
): { melds: Meld[]; leftover: Card[]; leftoverScore: number } {
  const optimal = scoreHand(cards, wildRank, engineOptions);
  if (submitted && submitted.length) {
    const checked = validateArrangement(cards, submitted, wildRank, engineOptions);
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

function advanceTurn(state: RoundState): void {
  const count = state.turnOrder.length;
  for (let step = 0; step < count; step += 1) {
    state.currentPlayerIndex = nextPlayerIndex(state.currentPlayerIndex, count);
    const uid = state.turnOrder[state.currentPlayerIndex];
    if (state.status !== 'final_turns') return;
    if (state.finalTurnsRemaining.includes(uid)) return;
  }
}

/** Closes the round and scores every hand. Idempotent. */
export function finishRound(state: RoundState): { state: RoundState; events: EngineEvent[] } {
  if (state.status === 'complete') return { state, events: [] };
  const next = clone(state);
  const roundScores: Record<string, number> = {};

  for (const uid of next.turnOrder) {
    const player = next.players[uid];
    if (player.roundScore === null) {
      const scored = scoreHand(player.hand, next.wildRank);
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
export function autoPlayTurn(
  state: RoundState,
  uid: string,
  random: RandomSource = secureRandom,
): EngineResult {
  const invalid = requireTurn(state, uid);
  if (invalid) return invalid;

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
  const analysis = findValidCombinations(hand, working.wildRank);
  const discardCandidate =
    analysis.bestAfterDiscard?.discard ??
    [...hand].sort((a, b) => cardValue(b, working.wildRank) - cardValue(a, working.wildRank))[0];

  return discard(working, uid, discardCandidate.id, { goOut: false });
}

/** Snapshot of everything other players are allowed to know. */
export interface PublicRoundView {
  round: number;
  wildRank: Rank;
  status: RoundStatus;
  drawPileCount: number;
  discardPileCount: number;
  discardTop: Card | null;
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  wentOutBy: string | null;
  finalTurnsRemaining: string[];
  cardCounts: Record<string, number>;
}

export function toPublicView(state: RoundState): PublicRoundView {
  const cardCounts: Record<string, number> = {};
  for (const [uid, player] of Object.entries(state.players)) {
    cardCounts[uid] = player.hand.length;
  }
  return {
    round: state.round,
    wildRank: state.wildRank,
    status: state.status,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    discardTop: topDiscard(state.discardPile),
    currentPlayerId: currentPlayerId(state),
    turnPhase: state.turnPhase,
    wentOutBy: state.wentOutBy,
    finalTurnsRemaining: [...state.finalTurnsRemaining],
    cardCounts,
  };
}
