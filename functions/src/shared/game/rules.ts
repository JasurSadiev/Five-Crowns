import { TOTAL_ROUNDS, MIN_PLAYERS, MAX_PLAYERS } from '../types/game';
import type { Rank } from '../types/card';
import { rankPlural } from './cards';

export { TOTAL_ROUNDS, MIN_PLAYERS, MAX_PLAYERS };

/** Round 1 deals 3 cards, round 11 deals 13. */
export function cardsForRound(round: number): number {
  assertRound(round);
  return round + 2;
}

/** The number of cards dealt is also the wild rank: round 9 -> Jacks (11) wild. */
export function wildRankForRound(round: number): Rank {
  return cardsForRound(round) as Rank;
}

export function assertRound(round: number): void {
  if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
    throw new Error(`Invalid round: ${round}`);
  }
}

export function isValidPlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS;
}

/**
 * The deck is 116 cards. Guarantees every player can be dealt a full hand with
 * at least one card left for the discard pile and some stock.
 */
export function maxPlayersForRound(round: number, deckSize = 116): number {
  return Math.floor((deckSize - 2) / cardsForRound(round));
}

/** Dealer rotates clockwise each round, starting with the host (index 0). */
export function dealerIndexForRound(round: number, playerCount: number): number {
  assertRound(round);
  if (playerCount <= 0) throw new Error('playerCount must be > 0');
  return (round - 1) % playerCount;
}

/** Play starts with the player to the dealer's left (clockwise). */
export function firstPlayerIndex(dealerIndex: number, playerCount: number): number {
  if (playerCount <= 0) throw new Error('playerCount must be > 0');
  return (dealerIndex + 1) % playerCount;
}

export function nextPlayerIndex(currentIndex: number, playerCount: number): number {
  if (playerCount <= 0) throw new Error('playerCount must be > 0');
  return (currentIndex + 1) % playerCount;
}

export function wildLabelForRound(round: number): string {
  return `${rankPlural(wildRankForRound(round))} are wild`;
}

/** Six-card tie-break round described by the official rules. */
export const TIE_BREAK_CARDS = 6;
export const TIE_BREAK_WILD_RANK: Rank = 6;
